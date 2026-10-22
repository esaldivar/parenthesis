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

namespace CoParent.Modules.Calendar.Endpoints;

/// <summary>Create and edit (edits replace the whole reminder, so clearing the child or details is explicit).</summary>
internal sealed record ReminderRequest(string? Title, DateTimeOffset? StartsAt, bool AllDay, Guid? ChildId, string? Details);

internal sealed record ReminderSeenView(Guid MembershipId, DateTimeOffset SeenAt);

/// <summary>A reminder as a parent sees it. <c>EditedBy</c>: the other parent who last edited it (null when nobody did, or the viewer did), for the quiet "edited by" note.</summary>
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
    IReadOnlyList<ReminderSeenView> SeenBy);

internal sealed record ReminderHistoryView(Guid ActorMembershipId, string Action, string? Changes, DateTimeOffset At);

/// <summary>
/// Shared reminders (#72, part 1: #170). Either parent creates, edits or deletes at once, with no approval request;
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
        DateTimeOffset from, DateTimeOffset to, ITenantContext tenant, CalendarDbContext db, CancellationToken cancellationToken)
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
            .Where(r => r.DeletedAt == null && r.StartsAt >= from && r.StartsAt < to)
            .OrderBy(r => r.StartsAt)
            .ToListAsync(cancellationToken);
        var ids = reminders.Select(r => r.Id).ToList();
        var seen = await db.ReminderSeen.Where(s => ids.Contains(s.ReminderId)).ToListAsync(cancellationToken);
        return TypedResults.Ok(reminders.Select(r => View(r, tenant, seen)).ToList());
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
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var errors = await ValidateAsync(request, roster, cancellationToken);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var now = clock.GetUtcNow();
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
        };
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

        var errors = await ValidateAsync(request, roster, cancellationToken);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

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

        var seen = await LoadSeenAsync(db, reminderId, cancellationToken);
        if (changes.Count == 0)
        {
            return TypedResults.Ok(View(reminder, tenant, seen));
        }

        var now = clock.GetUtcNow();
        (reminder.Title, reminder.StartsAt, reminder.AllDay, reminder.ChildProfileId, reminder.Details) =
            (title, startsAt, request.AllDay, request.ChildId, details);
        (reminder.LastEditedByMembershipId, reminder.LastEditedAt) = (tenant.MembershipId, now);
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.ReminderHistory.Add(History(reminder, tenant, ReminderAction.Edited, string.Join(", ", changes), now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "reminder.edited", "reminder", reminder.Id), ct);
        }, cancellationToken);

        return TypedResults.Ok(View(reminder, tenant, seen));
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
        ReminderRequest request, IFamilyRoster roster, CancellationToken cancellationToken)
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

        return errors;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

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

    private static ReminderView View(Reminder r, ITenantContext tenant, IEnumerable<ReminderSeen> seen) => new(
        r.Id,
        r.Title,
        r.StartsAt,
        r.AllDay,
        r.ChildProfileId,
        r.Details,
        r.CreatedByMembershipId,
        r.CreatedAt,
        EditedBy: r.LastEditedByMembershipId is { } editor && editor != tenant.MembershipId ? editor : null,
        r.LastEditedAt,
        seen.Where(s => s.ReminderId == r.Id).OrderBy(s => s.SeenAt).Select(s => new ReminderSeenView(s.MembershipId, s.SeenAt)).ToList());
}
