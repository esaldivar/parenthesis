using CoParent.Modules.Calendar.Domain;
using CoParent.Modules.Calendar.Infrastructure;
using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Modules.Calendar.Endpoints;

/// <summary>Create and edit (edits replace the whole reminder, so clearing the child or details is explicit).</summary>
internal sealed record ReminderRequest(
    string? Title,
    DateTimeOffset? StartsAt,
    bool AllDay,
    Guid? ChildId,
    string? Details,
    RepeatFrequency? Repeat = null,
    DateOnly? RepeatUntil = null,
    int? RepeatCount = null);

internal sealed record ReminderSeenView(Guid MembershipId, DateTimeOffset SeenAt);

/// <summary>
/// A reminder as a parent sees it. <c>EditedBy</c>: the other parent who last edited it (null when nobody did, or the
/// viewer did), for the quiet "edited by" note. In a list, a repeating reminder appears once per occurrence:
/// <c>StartsAt</c> is that occurrence and <c>SeriesStartsAt</c> the first one (they're equal for a one-off).
/// </summary>
internal sealed record ReminderView(
    Guid Id,
    string Title,
    DateTimeOffset StartsAt,
    bool AllDay,
    Guid? ChildId,
    string? Details,
    Guid CreatedByMembershipId,
    DateTimeOffset CreatedAt,
    Guid? EditedBy,
    DateTimeOffset? LastEditedAt,
    IReadOnlyList<ReminderSeenView> SeenBy,
    RepeatFrequency Repeat,
    DateOnly? RepeatUntil,
    int? RepeatCount,
    DateTimeOffset SeriesStartsAt);

internal sealed record ReminderHistoryView(Guid ActorMembershipId, string Action, string? Changes, DateTimeOffset At);

/// <summary>
/// Shared reminders (#72; #170, and repeats in #171). Either parent creates, edits or deletes at once, with no approval request;
/// history records who changed what. Seen is per parent and set only by <c>POST …/seen</c>, which the app calls when
/// a parent opens the details. Parents only for now: whether children see reminders isn't decided (TODO.md), and child
/// sessions are refused by the host's gate.
/// </summary>
internal static class ReminderEndpoints
{
    public static void Map(IEndpointRouteBuilder family)
    {
        var reminders = family.MapGroup("/calendar/reminders").WithTags("Calendar");
        reminders.MapGet("/", ListAsync);
        reminders.MapPost("/", CreateAsync);
        reminders.MapGet("/{reminderId:guid}", GetAsync);
        reminders.MapPut("/{reminderId:guid}", UpdateAsync);
        reminders.MapDelete("/{reminderId:guid}", DeleteAsync);
        reminders.MapGet("/{reminderId:guid}/history", HistoryAsync);
        reminders.MapPost("/{reminderId:guid}/seen", MarkSeenAsync);
    }

    /// <summary>Reminders in [from, to). Never marks anything seen.</summary>
    private static async Task<Results<Ok<List<ReminderView>>, ValidationProblem, ForbidHttpResult>> ListAsync(
        DateTimeOffset from,
        DateTimeOffset to,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (to <= from || to - from > CalendarEndpoints.MaxRange)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["to"] = [$"Choose a range that ends after it starts and spans at most {CalendarEndpoints.MaxRange.TotalDays:0} days."],
            });
        }

        (from, to) = (from.ToUniversalTime(), to.ToUniversalTime());
        var reminders = await db.Reminders
            .Where(r => r.DeletedAt == null && r.StartsAt < to && r.SeriesEndsAt >= from)
            .ToListAsync(cancellationToken);
        var ids = reminders.Select(r => r.Id).ToList();
        var seen = await db.ReminderSeen.Where(s => ids.Contains(s.ReminderId)).ToListAsync(cancellationToken);
        var zone = await roster.TimeZoneAsync(cancellationToken);
        return TypedResults.Ok(reminders
            .SelectMany(r => ReminderSchedule.Between(r, zone, from, to).Select(at => View(r, tenant, seen, at)))
            .OrderBy(v => v.StartsAt)
            .ToList());
    }

    private static async Task<Results<Ok<ReminderView>, NotFound, ForbidHttpResult>> GetAsync(
        Guid reminderId, ITenantContext tenant, CalendarDbContext db, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var reminder = await FindAsync(db, reminderId, cancellationToken);
        return reminder is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(View(reminder, tenant, await LoadSeenAsync(db, reminderId, cancellationToken)));
    }

    private static async Task<Results<Created<ReminderView>, ValidationProblem, ForbidHttpResult>> CreateAsync(
        ReminderRequest request,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        [FromKeyedServices(CalendarModule.TodayClock)] TimeProvider today,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var zone = await roster.TimeZoneAsync(cancellationToken);
        var errors = await ValidateAsync(request, roster, zone, cancellationToken);
        if (errors.Count == 0 && ReminderSchedule.LocalDate(request.StartsAt!.Value, zone) < today.In(zone))
        {
            // A new reminder is for today on (#232).
            errors["startsAt"] = [CalendarToday.PastDate];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var now = clock.GetUtcNow();
        var repeat = Repeat(request);
        var reminder = new Reminder
        {
            FamilyId = tenant.FamilyId,
            Title = request.Title!.Trim(),
            StartsAt = request.StartsAt!.Value.ToUniversalTime(),
            AllDay = request.AllDay,
            ChildProfileId = request.ChildId,
            Details = Clean(request.Details),
            CreatedByMembershipId = tenant.MembershipId,
            CreatedAt = now,
            Repeat = repeat.Frequency,
            RepeatUntil = repeat.Until,
            RepeatCount = repeat.Count,
        };
        reminder.SeriesEndsAt = SeriesEnd(reminder, zone);
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.Reminders.Add(reminder);
            db.ReminderHistory.Add(History(reminder, tenant, ReminderAction.Created, null, now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "reminder.created", "reminder", reminder.Id), ct);
        }, cancellationToken);

        return TypedResults.Created(
            $"/api/families/{tenant.FamilyId}/calendar/reminders/{reminder.Id}", View(reminder, tenant, []));
    }

    /// <summary>Either parent, at once, no approval. History records the fields that changed.</summary>
    private static async Task<Results<Ok<ReminderView>, NotFound, ValidationProblem, ForbidHttpResult>> UpdateAsync(
        Guid reminderId,
        ReminderRequest request,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        [FromKeyedServices(CalendarModule.TodayClock)] TimeProvider today,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var reminder = await FindAsync(db, reminderId, cancellationToken);
        if (reminder is null)
        {
            return TypedResults.NotFound();
        }

        var zone = await roster.TimeZoneAsync(cancellationToken);
        var errors = await ValidateAsync(request, roster, zone, cancellationToken);
        if (errors.Count == 0)
        {
            // Moving it is to today on; a reminder already past keeps its own day (#232).
            var day = ReminderSchedule.LocalDate(request.StartsAt!.Value, zone);
            if (day < today.In(zone) && day != ReminderSchedule.LocalDate(reminder.StartsAt, zone))
            {
                errors["startsAt"] = [CalendarToday.PastDate];
            }
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var repeat = Repeat(request);
        var title = request.Title!.Trim();
        var startsAt = request.StartsAt!.Value.ToUniversalTime();
        var details = Clean(request.Details);
        var changes = new List<string>();
        if (title != reminder.Title)
        {
            changes.Add("title");
        }

        if (startsAt != reminder.StartsAt || request.AllDay != reminder.AllDay)
        {
            changes.Add("date");
        }

        if (request.ChildId != reminder.ChildProfileId)
        {
            changes.Add("child");
        }

        if (details != reminder.Details)
        {
            changes.Add("details");
        }

        if (repeat != (reminder.Repeat, reminder.RepeatUntil, reminder.RepeatCount))
        {
            changes.Add("repeat");
        }

        var seen = await LoadSeenAsync(db, reminderId, cancellationToken);
        if (changes.Count == 0)
        {
            return TypedResults.Ok(View(reminder, tenant, seen));
        }

        var now = clock.GetUtcNow();
        (reminder.Title, reminder.StartsAt, reminder.AllDay, reminder.ChildProfileId, reminder.Details) =
            (title, startsAt, request.AllDay, request.ChildId, details);
        (reminder.Repeat, reminder.RepeatUntil, reminder.RepeatCount) = repeat;
        reminder.SeriesEndsAt = SeriesEnd(reminder, zone);
        (reminder.LastEditedByMembershipId, reminder.LastEditedAt) = (tenant.MembershipId, now);
        // Owner decision (October 22, 2026): a real change clears the other parent's Seen, so the quiet "edited by"
        // note invites a second look. The editor's own Seen stays.
        var othersSeen = seen.Where(s => s.MembershipId != tenant.MembershipId).ToList();
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.ReminderSeen.RemoveRange(othersSeen);
            db.ReminderHistory.Add(History(reminder, tenant, ReminderAction.Edited, string.Join(", ", changes), now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "reminder.edited", "reminder", reminder.Id), ct);
        }, cancellationToken);

        return TypedResults.Ok(View(reminder, tenant, seen.Except(othersSeen)));
    }

    /// <summary>Either parent, at once, no approval. The row is kept (marked deleted) so its history stays.</summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> DeleteAsync(
        Guid reminderId,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var reminder = await FindAsync(db, reminderId, cancellationToken);
        if (reminder is null)
        {
            return TypedResults.NotFound();
        }

        var now = clock.GetUtcNow();
        reminder.DeletedAt = now;
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.ReminderHistory.Add(History(reminder, tenant, ReminderAction.Deleted, null, now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "reminder.deleted", "reminder", reminder.Id), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<List<ReminderHistoryView>>, NotFound, ForbidHttpResult>> HistoryAsync(
        Guid reminderId, ITenantContext tenant, CalendarDbContext db, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (await FindAsync(db, reminderId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var history = await db.ReminderHistory
            .Where(h => h.ReminderId == reminderId)
            .OrderBy(h => h.At)
            .Select(h => new ReminderHistoryView(h.ActorMembershipId, h.Action.ToString(), h.Changes, h.At))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(history);
    }

    /// <summary>
    /// The caller opened the details on purpose. Only ever sets the caller's own Seen: the membership comes from the
    /// signed-in session, never from the request.
    /// </summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> MarkSeenAsync(
        Guid reminderId, ITenantContext tenant, CalendarDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (await FindAsync(db, reminderId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var now = clock.GetUtcNow();
        var mine = await db.ReminderSeen.SingleOrDefaultAsync(
            s => s.ReminderId == reminderId && s.MembershipId == tenant.MembershipId, cancellationToken);
        if (mine is null)
        {
            db.ReminderSeen.Add(new ReminderSeen
            {
                FamilyId = tenant.FamilyId,
                ReminderId = reminderId,
                MembershipId = tenant.MembershipId,
                SeenAt = now,
            });
        }
        else
        {
            mine.SeenAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static Task<Reminder?> FindAsync(CalendarDbContext db, Guid reminderId, CancellationToken cancellationToken) =>
        db.Reminders.SingleOrDefaultAsync(r => r.Id == reminderId && r.DeletedAt == null, cancellationToken);

    private static Task<List<ReminderSeen>> LoadSeenAsync(CalendarDbContext db, Guid reminderId, CancellationToken cancellationToken) =>
        db.ReminderSeen.Where(s => s.ReminderId == reminderId).ToListAsync(cancellationToken);

    private static async Task<Dictionary<string, string[]>> ValidateAsync(
        ReminderRequest request, IFamilyRoster roster, string zone, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        var title = request.Title?.Trim() ?? "";
        if (title.Length is 0 or > Reminder.TitleMaxLength)
        {
            errors["title"] = [$"Enter a title of 1 to {Reminder.TitleMaxLength} characters."];
        }

        if (request.StartsAt is null)
        {
            errors["startsAt"] = ["Choose when the reminder is for."];
        }

        if ((request.Details?.Trim().Length ?? 0) > Reminder.DetailsMaxLength)
        {
            errors["details"] = [$"Keep the details under {Reminder.DetailsMaxLength} characters."];
        }

        if (request.ChildId is { } child && !(await roster.ActiveChildIdsAsync(cancellationToken)).Contains(child))
        {
            errors["childId"] = ["Choose a child who's in this family (and approved by both parents)."];
        }

        if (request.Repeat is { } repeat && repeat != RepeatFrequency.None)
        {
            if (request.RepeatUntil is null == request.RepeatCount is null)
            {
                errors["repeat"] = ["Choose when a repeating reminder ends: an end date or a number of times."];
            }
            else if (request.RepeatCount is { } count && count is < 2 or > ReminderSchedule.MaxOccurrences)
            {
                errors["repeatCount"] = [$"Repeat it 2 to {ReminderSchedule.MaxOccurrences} times."];
            }
            else if (request.RepeatUntil is { } until && request.StartsAt is { } starts)
            {
                var first = ReminderSchedule.LocalDate(starts, zone);
                if (until <= first || until > first.AddYears(ReminderSchedule.MaxYears))
                {
                    errors["repeatUntil"] = [$"Choose an end date after the first day and within {ReminderSchedule.MaxYears} years."];
                }
            }
        }

        return errors;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    /// <summary>The repeat fields to store: none for a one-off, otherwise the frequency and its one end condition.</summary>
    private static (RepeatFrequency Frequency, DateOnly? Until, int? Count) Repeat(ReminderRequest request) =>
        request.Repeat is { } repeat && repeat != RepeatFrequency.None
            ? (repeat, request.RepeatUntil, request.RepeatCount)
            : (RepeatFrequency.None, null, null);

    private static DateTimeOffset SeriesEnd(Reminder r, string zone) =>
        ReminderSchedule.Occurrences(r.StartsAt, r.Repeat, r.RepeatUntil, r.RepeatCount, zone).Last();

    private static ReminderHistory History(
        Reminder reminder, ITenantContext tenant, ReminderAction action, string? changes, DateTimeOffset at) => new()
        {
            FamilyId = tenant.FamilyId,
            ReminderId = reminder.Id,
            ActorMembershipId = tenant.MembershipId,
            Action = action,
            Changes = changes,
            At = at,
        };

    private static ReminderView View(
        Reminder r, ITenantContext tenant, IEnumerable<ReminderSeen> seen, DateTimeOffset? occurrence = null) => new(
        r.Id,
        r.Title,
        occurrence ?? r.StartsAt,
        r.AllDay,
        r.ChildProfileId,
        r.Details,
        r.CreatedByMembershipId,
        r.CreatedAt,
        EditedBy: r.LastEditedByMembershipId is { } editor && editor != tenant.MembershipId ? editor : null,
        r.LastEditedAt,
        seen.Where(s => s.ReminderId == r.Id).OrderBy(s => s.SeenAt).Select(s => new ReminderSeenView(s.MembershipId, s.SeenAt)).ToList(),
        r.Repeat,
        r.RepeatUntil,
        r.RepeatCount,
        r.StartsAt);
}
