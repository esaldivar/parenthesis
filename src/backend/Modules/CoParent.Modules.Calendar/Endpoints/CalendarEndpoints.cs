using System.Globalization;
using CoParent.Modules.Approvals.Contracts;
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

internal sealed record CreateEventRequest(
    EventCategory? Category,
    string? Title,
    DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt,
    bool AllDay,
    string? Location,
    string? Notes,
    IReadOnlyList<Guid>? ChildIds,
    Guid? CaregiverMembershipId,
    EventRepeatRequest? Repeat = null);

/// <summary>
/// Repeat every <paramref name="Interval"/> days, weeks (on <paramref name="Days"/>) or months (#193, #238), ending on
/// <paramref name="Until"/> or after <paramref name="Count"/> times. Without a frequency it's weekly, every week.
/// </summary>
internal sealed record EventRepeatRequest(
    IReadOnlyList<DayOfWeek>? Days, DateOnly? Until, int? Count, SeriesFrequency? Frequency = null, int? Interval = null);

/// <summary>How a repeating event repeats, for its details ("Every 2 weeks on Wed and Fri until Dec 30").</summary>
internal sealed record SeriesView(
    IReadOnlyList<DayOfWeek> Days, DateOnly? Until, int? Count, SeriesFrequency Frequency = SeriesFrequency.Weekly, int Interval = 1);

/// <summary>Which dates of a repeating event an edit or cancel applies to (#193). One-off events ignore it.</summary>
internal enum EditScope
{
    This,
    Following,
    All,
}

/// <summary><paramref name="Reason"/>: an optional note to the other parent, kept with the approval request (a swap's reason).</summary>
internal sealed record UpdateEventRequest(
    string? Title,
    DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt,
    bool? AllDay,
    string? Location,
    string? Notes,
    Guid? CaregiverMembershipId,
    string? Reason = null);

internal sealed record ConflictsView(IReadOnlyList<string> Warnings);

internal sealed record EventView(
    Guid Id,
    string Title,
    EventCategory Category,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    bool AllDay,
    string? Location,
    string? Notes,
    EventStatus Status,
    IReadOnlyList<Guid> ChildIds,
    Guid? CaregiverMembershipId,
    Guid OwnerMembershipId,
    bool ConfirmedBeforeCoParentJoined,
    Guid? ChangeRequestId,
    PendingChange PendingChange,
    ProposedTimes? Proposed,
    IReadOnlyList<string> Warnings,
    Guid? SeriesId = null,
    SeriesView? Repeat = null);

/// <summary>The shared calendar (C-01, AP-03; docs/design/CALENDAR_DECISIONS.md).</summary>
internal static class CalendarEndpoints
{
    /// <summary>The longest single event; longer arrangements are separate events or (later) recurrence.</summary>
    public static readonly TimeSpan MaxDuration = TimeSpan.FromDays(31);

    /// <summary>The widest range one list request may cover (about a month view plus padding).</summary>
    public static readonly TimeSpan MaxRange = TimeSpan.FromDays(62);

    public static void Map(IEndpointRouteBuilder family)
    {
        var calendar = family.MapGroup("/calendar/events").WithTags("Calendar");
        calendar.MapGet("/", ListAsync).WithMetadata(new ChildSessionAllowed());
        calendar.MapPost("/", CreateAsync);
        calendar.MapGet("/{eventId:guid}", GetAsync);
        calendar.MapGet("/{eventId:guid}/conflicts", ConflictsAsync);
        calendar.MapPatch("/{eventId:guid}", UpdateAsync);
        calendar.MapDelete("/{eventId:guid}", CancelAsync);
        calendar.MapPost("/{eventId:guid}/dismiss", DismissAsync);
    }

    /// <summary>Non-blocking: the proposed parenting time overlaps the other parent's unavailable time (CALENDAR_DECISIONS.md).</summary>
    public const string OverlapsCoParentUnavailable = "OverlapsCoParentUnavailable";

    /// <summary>
    /// Events overlapping [from, to). Parents see pending and confirmed events, and declined requests until their dates
    /// pass or they remove them from their own calendar (#199); an Unavailable event's notes are shown only to its
    /// owner. A child sees only confirmed events that include them, with no notes, no unavailability and nothing
    /// pending or declined (children never see approvals or disagreements).
    /// </summary>
    private static async Task<Results<Ok<List<EventView>>, ValidationProblem>> ListAsync(
        DateTimeOffset from,
        DateTimeOffset to,
        ITenantContext tenant,
        CalendarDbContext db,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (to <= from || to - from > MaxRange)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["to"] = [$"Choose a range that ends after it starts and spans at most {MaxRange.TotalDays:0} days."],
            });
        }

        // PostgreSQL timestamptz takes UTC only; callers may send any offset.
        (from, to) = (from.ToUniversalTime(), to.ToUniversalTime());
        var query = db.Events.Where(e => e.StartsAt < to && e.EndsAt > from);
        query = tenant.Role == FamilyRole.Child
            ? query.Where(e => e.Status == EventStatus.Confirmed
                && e.Category != EventCategory.Unavailable
                && e.Children.Any(c => c.ChildProfileId == tenant.MembershipId))
            : DeclinedStillShown(query, db, tenant.MembershipId, clock.GetUtcNow());

        var events = await query.OrderBy(e => e.StartsAt).ToListAsync(cancellationToken);
        var series = await SeriesForAsync(db, tenant, events, cancellationToken);
        return TypedResults.Ok(events.Select(e => View(e, tenant, changeRequestId: null, [], series)).ToList());
    }

    private static async Task<Results<Created<EventView>, ValidationProblem, ForbidHttpResult>> CreateAsync(
        CreateEventRequest request,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IChangeRequests changeRequests,
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

        var children = await roster.ActiveChildIdsAsync(cancellationToken);
        var parents = await roster.ActiveParentMembershipIdsAsync(cancellationToken);
        var errors = Validate(request, children, parents);
        if (errors.Count == 0)
        {
            // New dates start from today in the family's time zone (#232); earlier times today are fine.
            var zone = await roster.TimeZoneAsync(cancellationToken);
            if (EventSchedule.LocalDate(request.StartsAt!.Value, zone) < today.In(zone))
            {
                errors["startsAt"] = [CalendarToday.PastStart];
            }
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var category = request.Category!.Value;
        if (request.Repeat is { } repeat)
        {
            return await CreateSeriesAsync(
                request, repeat, parents, http, tenant, db, roster, changeRequests, unitOfWork, audit, clock, cancellationToken);
        }

        var (starts, ends) = (request.StartsAt!.Value.ToUniversalTime(), request.EndsAt!.Value.ToUniversalTime());
        var person = category == EventCategory.ParentingTime ? request.CaregiverMembershipId : tenant.MembershipId;
        var clash = await OwnOverlapErrorsAsync(db, category, person, [(starts, ends)], cancellationToken);
        if (clash.Count > 0)
        {
            return TypedResults.ValidationProblem(clash);
        }

        var (title, location) = Shareable(category, request.Title, request.Location);
        var needsApproval = CalendarEvent.NeedsApproval(category);

        // Decision 7: while a family has one parent, approval-gated events are confirmed and labelled, so the
        // co-parent can review them when they join. A joint event always waits for both parents.
        var soloConfirm = needsApproval && category != EventCategory.Joint && parents.Count < 2;
        var calendarEvent = new CalendarEvent
        {
            FamilyId = tenant.FamilyId,
            Title = title,
            Category = category,
            StartsAt = starts,
            EndsAt = ends,
            AllDay = request.AllDay,
            Location = location,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            Status = needsApproval && !soloConfirm ? EventStatus.PendingApproval : EventStatus.Confirmed,
            CaregiverMembershipId = category == EventCategory.ParentingTime ? request.CaregiverMembershipId : null,
            OwnerMembershipId = tenant.MembershipId,
            ConfirmedBeforeCoParentJoined = soloConfirm,
            CreatedAt = clock.GetUtcNow(),
        };
        calendarEvent.Children.AddRange((request.ChildIds ?? []).Distinct().Select(id =>
            new EventChild { FamilyId = tenant.FamilyId, EventId = calendarEvent.Id, ChildProfileId = id }));

        // Reads first: once the unit of work commits, its transaction is finished.
        var warnings = await WarningsAsync(
            db,
            new WarningCheck(category, calendarEvent.StartsAt, calendarEvent.EndsAt, tenant.MembershipId, calendarEvent.CaregiverMembershipId,
                calendarEvent.Children.Select(c => c.ChildProfileId).ToList(), ExcludeEventId: null),
            cancellationToken);
        var userId = http.User.GetUserId()!.Value;
        Guid? changeRequestId = null;
        Dictionary<string, string[]>? refused = null;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            if ((refused = await RefusedUnderLockAsync(db, category, person, [(starts, ends)], ct)) is not null)
            {
                return;
            }

            db.Events.Add(calendarEvent);
            await db.SaveChangesAsync(ct);
            if (calendarEvent.Status == EventStatus.PendingApproval)
            {
                changeRequestId = await changeRequests.ProposeAsync(
                    new ChangeRequestProposal(
                        category == EventCategory.Joint ? ChangeRequestTypes.JointEventCreate : ChangeRequestTypes.CalendarCreate,
                        "calendar_event",
                        calendarEvent.Id,
                        Summary(calendarEvent),
                        tenant.MembershipId,
                        userId),
                    ct);
            }

            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "calendar_event.created", "calendar_event", calendarEvent.Id), ct);
        }, cancellationToken);

        if (refused is not null)
        {
            return TypedResults.ValidationProblem(refused);
        }

        return TypedResults.Created(
            $"/api/families/{tenant.FamilyId}/calendar/events/{calendarEvent.Id}",
            View(calendarEvent, tenant, changeRequestId, warnings));
    }

    /// <summary>One event, for a parent: the same view the list gives (an Unavailable event's notes only to its owner).</summary>
    /// <summary>
    /// A parent's list: pending and confirmed events, plus declined requests (owner decisions, October 22, 2026) that
    /// haven't ended yet and that this parent hasn't removed from their calendar.
    /// </summary>
    private static IQueryable<CalendarEvent> DeclinedStillShown(
        IQueryable<CalendarEvent> query, CalendarDbContext db, Guid membershipId, DateTimeOffset now) =>
        query.Where(e => e.Status == EventStatus.Confirmed
            || e.Status == EventStatus.PendingApproval
            || (e.Status == EventStatus.Rejected
                && e.DeclinedByParent
                && e.EndsAt > now
                && !db.Dismissals.Any(d => d.EventId == e.Id && d.MembershipId == membershipId)));

    /// <summary>
    /// Removes a declined request from the caller's own calendar (#199). Only ever the caller's: the membership comes
    /// from the signed-in session. The co-parent's calendar and the approvals history don't change.
    /// </summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> DismissAsync(
        Guid eventId, ITenantContext tenant, CalendarDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await db.Events.AnyAsync(e => e.Id == eventId && e.Status == EventStatus.Rejected && e.DeclinedByParent, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        if (!await db.Dismissals.AnyAsync(d => d.EventId == eventId && d.MembershipId == tenant.MembershipId, cancellationToken))
        {
            db.Dismissals.Add(new EventDismissal
            {
                FamilyId = tenant.FamilyId,
                EventId = eventId,
                MembershipId = tenant.MembershipId,
                DismissedAt = clock.GetUtcNow(),
            });
            await db.SaveChangesAsync(cancellationToken);
        }

        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<EventView>, NotFound, ForbidHttpResult>> GetAsync(
        Guid eventId, ITenantContext tenant, CalendarDbContext db, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var e = await db.Events.SingleOrDefaultAsync(
            x => x.Id == eventId && (x.Status == EventStatus.Confirmed || x.Status == EventStatus.PendingApproval),
            cancellationToken);
        return e is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(View(e, tenant, changeRequestId: null, [], await SeriesForAsync(db, tenant, [e], cancellationToken)));
    }

    /// <summary>
    /// The gentle warnings a change to an event would get, without changing anything, so a parent can choose to send
    /// anyway or pick different dates before a swap is sent (handoff 2026-10-20). They never block a request.
    /// </summary>
    private static async Task<Results<Ok<ConflictsView>, NotFound, ValidationProblem, ForbidHttpResult>> ConflictsAsync(
        Guid eventId,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt,
        ITenantContext tenant,
        CalendarDbContext db,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (endsAt <= startsAt || endsAt - startsAt > MaxDuration)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["endsAt"] = [$"Choose an end that's after the start, at most {MaxDuration.TotalDays:0} days later."],
            });
        }

        var e = await db.Events.SingleOrDefaultAsync(x => x.Id == eventId, cancellationToken);
        if (e is null || e.Status is EventStatus.Cancelled or EventStatus.Rejected
            || (e.Category == EventCategory.Unavailable && e.OwnerMembershipId != tenant.MembershipId))
        {
            return TypedResults.NotFound();
        }

        var warnings = await WarningsAsync(
            db,
            new WarningCheck(e.Category, startsAt.ToUniversalTime(), endsAt.ToUniversalTime(), tenant.MembershipId,
                e.CaregiverMembershipId, e.Children.Select(c => c.ChildProfileId).ToList(), ExcludeEventId: e.Id),
            cancellationToken);
        return TypedResults.Ok(new ConflictsView(warnings));
    }

    /// <summary>
    /// Edits an event. Activities (either parent) and unavailable time (its owner) change at once. A confirmed
    /// parenting-time, holiday or joint event keeps its current values and gets a CalendarModify request ("change
    /// pending", with before → after); a parenting-time swap is such a change. Notes always change at once.
    /// </summary>
    private static async Task<Results<Ok<EventView>, Accepted<EventView>, NotFound, ValidationProblem, ProblemHttpResult, ForbidHttpResult>> UpdateAsync(
        Guid eventId,
        UpdateEventRequest request,
        string? scope,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IChangeRequests changeRequests,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        [FromKeyedServices(CalendarModule.TodayClock)] TimeProvider today,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var e = await db.Events.SingleOrDefaultAsync(x => x.Id == eventId, cancellationToken);
        if (e is null || e.Status is EventStatus.Cancelled or EventStatus.Rejected
            || (e.Category == EventCategory.Unavailable && e.OwnerMembershipId != tenant.MembershipId))
        {
            return TypedResults.NotFound();
        }

        if (e.Status == EventStatus.PendingApproval || e.PendingChange != PendingChange.None)
        {
            return RequestWaiting("Wait for your co-parent's answer, or withdraw the request, before changing it again.");
        }

        if (ParseScope(scope) is not { } editScope)
        {
            return InvalidScope();
        }

        if (editScope != EditScope.This && e.SeriesId is not null)
        {
            if (CalendarEvent.NeedsApproval(e.Category))
            {
                return OneDateAtATime();
            }

            return await UpdateSeriesAsync(e, editScope, request, http, tenant, db, roster, unitOfWork, audit, cancellationToken);
        }

        var current = e.Current();
        var change = new ProposedTimes(
            string.IsNullOrWhiteSpace(request.Title) ? current.Title : request.Title.Trim(),
            request.StartsAt?.ToUniversalTime() ?? current.StartsAt,
            request.EndsAt?.ToUniversalTime() ?? current.EndsAt,
            request.AllDay ?? current.AllDay,
            request.Location is null ? current.Location : (string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim()),
            e.Category == EventCategory.ParentingTime ? request.CaregiverMembershipId ?? current.CaregiverMembershipId : null);
        change = UnavailableSafe(e.Category, change);

        var parents = await roster.ActiveParentMembershipIdsAsync(cancellationToken);
        var errors = ValidateChange(change, e.Category, parents, request.Notes);
        if ((request.Reason?.Trim().Length ?? 0) > ChangeRequestProposal.ReasonMaxLength)
        {
            errors["reason"] = [$"Keep the reason under {ChangeRequestProposal.ReasonMaxLength} characters."];
        }

        // Existing overlaps stay (owner decision, #210): only a change of time or caregiver is checked, so a title or
        // notes edit always works.
        if (errors.Count == 0 && change.StartsAt != current.StartsAt)
        {
            // Moving it starts from today on; an event already past or under way keeps its own start day (#232).
            var zone = await roster.TimeZoneAsync(cancellationToken);
            var day = EventSchedule.LocalDate(change.StartsAt, zone);
            if (day < today.In(zone) && day != EventSchedule.LocalDate(current.StartsAt, zone))
            {
                errors["startsAt"] = [CalendarToday.PastStart];
            }
        }

        if (errors.Count == 0 && change.EndsAt != current.EndsAt)
        {
            // Moving the end works the same way: from today on, unless it stays on the event's own end day (#232).
            var zone = await roster.TimeZoneAsync(cancellationToken);
            var day = EventSchedule.LocalDate(change.EndsAt, zone);
            if (day < today.In(zone) && day != EventSchedule.LocalDate(current.EndsAt, zone))
            {
                errors["endsAt"] = [CalendarToday.PastEnd];
            }
        }

        var moved = (change.StartsAt, change.EndsAt, change.CaregiverMembershipId)
            != (current.StartsAt, current.EndsAt, current.CaregiverMembershipId);
        var person = e.Category == EventCategory.ParentingTime ? change.CaregiverMembershipId : e.OwnerMembershipId;
        if (errors.Count == 0 && moved)
        {
            errors = await OwnOverlapErrorsAsync(db, e.Category, person, [(change.StartsAt, change.EndsAt)], cancellationToken);
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var warnings = await WarningsAsync(
            db,
            new WarningCheck(e.Category, change.StartsAt, change.EndsAt, tenant.MembershipId, change.CaregiverMembershipId,
                e.Children.Select(c => c.ChildProfileId).ToList(), ExcludeEventId: e.Id),
            cancellationToken);
        var userId = http.User.GetUserId()!.Value;
        var needsApproval = CalendarEvent.NeedsApproval(e.Category) && parents.Count >= 2 && change != current;
        Guid? changeRequestId = null;
        Dictionary<string, string[]>? refused = null;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            if (moved && (refused = await RefusedUnderLockAsync(db, e.Category, person, [(change.StartsAt, change.EndsAt)], ct)) is not null)
            {
                return;
            }

            if (request.Notes is not null)
            {
                e.Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
            }

            if (needsApproval)
            {
                e.ProposeModify(change);
            }
            else
            {
                e.Apply(change);
            }

            await db.SaveChangesAsync(ct);
            if (needsApproval)
            {
                changeRequestId = await changeRequests.ProposeAsync(
                    new ChangeRequestProposal(
                        ChangeRequestTypes.CalendarModify, "calendar_event", e.Id, $"Change {e.Title}", tenant.MembershipId, userId,
                        request.Reason),
                    ct);
            }

            var action = needsApproval ? "calendar_event.change_proposed" : "calendar_event.updated";
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, action, "calendar_event", e.Id), ct);
        }, cancellationToken);

        if (refused is not null)
        {
            return TypedResults.ValidationProblem(refused);
        }

        var view = View(e, tenant, changeRequestId, warnings);
        return needsApproval ? TypedResults.Accepted((string?)null, view) : TypedResults.Ok(view);
    }

    /// <summary>
    /// Cancels an event. Activities and unavailable time cancel at once; a confirmed approval-gated event gets a
    /// CalendarCancel request. A still-pending event is withdrawn from the approvals inbox instead.
    /// </summary>
    private static async Task<Results<NoContent, Accepted<EventView>, NotFound, ValidationProblem, ProblemHttpResult, ForbidHttpResult>> CancelAsync(
        Guid eventId,
        string? scope,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IChangeRequests changeRequests,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var e = await db.Events.SingleOrDefaultAsync(x => x.Id == eventId, cancellationToken);
        if (e is null || e.Status is EventStatus.Cancelled or EventStatus.Rejected
            || (e.Category == EventCategory.Unavailable && e.OwnerMembershipId != tenant.MembershipId))
        {
            return TypedResults.NotFound();
        }

        if (e.Status == EventStatus.PendingApproval || e.PendingChange != PendingChange.None)
        {
            return RequestWaiting("Withdraw that request from the approvals inbox instead.");
        }

        if (ParseScope(scope) is not { } cancelScope)
        {
            return InvalidScope();
        }

        if (cancelScope != EditScope.This && e.SeriesId is { } seriesId)
        {
            if (CalendarEvent.NeedsApproval(e.Category))
            {
                return OneDateAtATime();
            }

            var targets = await SeriesTargetsAsync(db, seriesId, e, cancelScope, cancellationToken);
            var actor = http.User.GetUserId()!.Value;
            await unitOfWork.ExecuteAsync(async ct =>
            {
                targets.ForEach(t => t.Status = EventStatus.Cancelled);
                await db.SaveChangesAsync(ct);
                await audit.RecordAsync(new AuditEntry(tenant.FamilyId, actor, "calendar_series.cancelled", "calendar_series", seriesId), ct);
            }, cancellationToken);
            return TypedResults.NoContent();
        }

        var parents = await roster.ActiveParentMembershipIdsAsync(cancellationToken);
        var needsApproval = CalendarEvent.NeedsApproval(e.Category) && parents.Count >= 2;
        var userId = http.User.GetUserId()!.Value;
        Guid? changeRequestId = null;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            if (needsApproval)
            {
                e.ProposeCancel();
            }
            else
            {
                e.Status = EventStatus.Cancelled;
            }

            await db.SaveChangesAsync(ct);
            if (needsApproval)
            {
                changeRequestId = await changeRequests.ProposeAsync(
                    new ChangeRequestProposal(
                        ChangeRequestTypes.CalendarCancel, "calendar_event", e.Id, $"Cancel {e.Title}", tenant.MembershipId, userId),
                    ct);
            }

            var action = needsApproval ? "calendar_event.cancel_proposed" : "calendar_event.cancelled";
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, action, "calendar_event", e.Id), ct);
        }, cancellationToken);

        return needsApproval
            ? TypedResults.Accepted((string?)null, View(e, tenant, changeRequestId, []))
            : TypedResults.NoContent();
    }

    /// <summary>
    /// Creates a repeating event (#193): every date at once, each its own event in one series. A repeat always ends
    /// within a year. Unavailable time and activities are confirmed at once. Repeating parenting time (#239, owner
    /// decision October 23, 2026) waits for one approval of the whole series: every date is pending until the co-parent
    /// approves, and approving or declining applies to all of them.
    /// </summary>
    private static async Task<Results<Created<EventView>, ValidationProblem, ForbidHttpResult>> CreateSeriesAsync(
        CreateEventRequest request,
        EventRepeatRequest repeat,
        IReadOnlyCollection<Guid> parents,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IChangeRequests changeRequests,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var category = request.Category!.Value;
        var zone = await roster.TimeZoneAsync(cancellationToken);
        var (starts, ends) = (request.StartsAt!.Value.ToUniversalTime(), request.EndsAt!.Value.ToUniversalTime());
        var frequency = repeat.Frequency ?? SeriesFrequency.Weekly;
        var interval = repeat.Interval ?? 1;
        // Only a weekly repeat has chosen days; daily and monthly go by the first date.
        var days = frequency == SeriesFrequency.Weekly ? EventSchedule.ToFlags(repeat.Days ?? []) : WeekDays.None;
        var errors = new Dictionary<string, string[]>();
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> dates = [];
        if (!CalendarSeries.CanRepeat(category))
        {
            errors["repeat"] = ["Holidays and family events can't repeat yet. Add each date on its own."];
        }
        else if (!Enum.IsDefined(frequency))
        {
            errors["repeat"] = ["Choose how often it repeats."];
        }
        else if (interval < 1 || interval > EventSchedule.MaxInterval(frequency))
        {
            errors["repeatInterval"] = [$"Choose every 1 to {EventSchedule.MaxInterval(frequency)} {Unit(frequency)}s."];
        }
        else if (frequency == SeriesFrequency.Weekly && days == WeekDays.None)
        {
            errors["repeat"] = ["Choose the days it repeats on."];
        }
        else if (repeat.Until is null == repeat.Count is null)
        {
            errors["repeat"] = ["Choose when it ends: on a date or after a number of times."];
        }
        else
        {
            var first = EventSchedule.LocalDate(starts, zone);
            if (repeat.Count is { } count && count is < 2 or > EventSchedule.MaxOccurrences)
            {
                errors["repeatCount"] = [$"Repeat it 2 to {EventSchedule.MaxOccurrences} times."];
            }
            else if (repeat.Until is { } until && (until < first || until > EventSchedule.LastAllowed(first)))
            {
                errors["repeatUntil"] = ["Choose an end date from the first day to a year later."];
            }
            else
            {
                dates = EventSchedule.Occurrences(starts, ends, days, repeat.Until, repeat.Count, zone, frequency, interval);
                if (dates.Count == 0)
                {
                    errors["repeat"] = ["None of the chosen days fall before the end date."];
                }
                else if (dates.Zip(dates.Skip(1)).Any(pair => pair.Second.Start < pair.First.End))
                {
                    // A long event repeated often would overlap itself (a 3-day event every day).
                    errors["repeat"] = ["Each date would run into the next. Repeat it less often, or make it shorter."];
                }
                else if (repeat.Count is { } wanted && dates.Count < wanted)
                {
                    errors["repeatCount"] = ["That many times goes past a year. Choose fewer, or an end date."];
                }
            }
        }

        // Parenting time is the caregiver's; unavailable time and activities are the owner's (#210).
        var person = category == EventCategory.ParentingTime ? request.CaregiverMembershipId : tenant.MembershipId;
        if (errors.Count == 0)
        {
            // Every date is checked before any is written: a series is added whole or not at all.
            errors = await OwnOverlapErrorsAsync(db, category, person, dates, cancellationToken);
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var now = clock.GetUtcNow();
        var series = new CalendarSeries
        {
            FamilyId = tenant.FamilyId,
            Category = category,
            OwnerMembershipId = tenant.MembershipId,
            Frequency = frequency,
            Interval = interval,
            Days = days,
            Until = repeat.Until,
            Count = repeat.Count,
            CreatedAt = now,
        };
        var (title, location) = Shareable(category, request.Title, request.Location);
        var notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        var childIds = (request.ChildIds ?? []).Distinct().ToList();
        // As for one date (Decision 7): while a family has one parent, parenting time is confirmed and labelled.
        var needsApproval = CalendarEvent.NeedsApproval(category);
        var soloConfirm = needsApproval && parents.Count < 2;
        var pending = needsApproval && !soloConfirm;
        var events = dates.Select(date =>
        {
            var e = new CalendarEvent
            {
                FamilyId = tenant.FamilyId,
                Title = title,
                Category = category,
                StartsAt = date.Start,
                EndsAt = date.End,
                AllDay = request.AllDay,
                Location = location,
                Notes = notes,
                Status = pending ? EventStatus.PendingApproval : EventStatus.Confirmed,
                CaregiverMembershipId = category == EventCategory.ParentingTime ? request.CaregiverMembershipId : null,
                OwnerMembershipId = tenant.MembershipId,
                ConfirmedBeforeCoParentJoined = soloConfirm,
                CreatedAt = now,
                SeriesId = series.Id,
            };
            e.Children.AddRange(childIds.Select(id => new EventChild { FamilyId = tenant.FamilyId, EventId = e.Id, ChildProfileId = id }));
            return e;
        }).ToList();

        // Reads first: once the unit of work commits, its transaction is finished.
        var warnings = await SeriesWarningsAsync(db, category, tenant.MembershipId, dates, cancellationToken);
        var userId = http.User.GetUserId()!.Value;
        Dictionary<string, string[]>? refused = null;
        Guid? changeRequestId = null;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            if ((refused = await RefusedUnderLockAsync(db, category, person, dates, ct)) is not null)
            {
                return;
            }

            db.Series.Add(series);
            db.Events.AddRange(events);
            await db.SaveChangesAsync(ct);
            if (pending)
            {
                // One request for every date (#239): the co-parent approves or declines the series as a whole.
                changeRequestId = await changeRequests.ProposeAsync(
                    new ChangeRequestProposal(
                        ChangeRequestTypes.CalendarCreate, SeriesTarget, series.Id, SeriesSummary(events, series, zone), tenant.MembershipId, userId),
                    ct);
            }

            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "calendar_series.created", "calendar_series", series.Id), ct);
        }, cancellationToken);

        if (refused is not null)
        {
            return TypedResults.ValidationProblem(refused);
        }

        return TypedResults.Created(
            $"/api/families/{tenant.FamilyId}/calendar/events/{events[0].Id}",
            View(events[0], tenant, changeRequestId, warnings, new Dictionary<Guid, CalendarSeries> { [series.Id] = series }));
    }

    /// <summary>An approval request about a whole series (#239): its target id is the series' id.</summary>
    internal const string SeriesTarget = "calendar_series";

    /// <summary>
    /// What the approvals inbox and its email say about a repeating request (#239): how it repeats, on which days, how
    /// many dates, and the first ones. "Add: Time with Dad, every 2 weeks on Tue and Thu, 6 dates: Oct 27, Oct 29,
    /// Nov 10 … Dec 10". Kept within the request summary's 200 characters.
    /// </summary>
    internal static string SeriesSummary(List<CalendarEvent> events, CalendarSeries series, string zone)
    {
        const int shown = 3;
        var dates = events.Select(e => EventSchedule.LocalDate(e.StartsAt, zone)).ToList();
        var n = series.Interval;
        var every = series.Frequency switch
        {
            SeriesFrequency.Daily => n == 1 ? "every day" : $"every {n} days",
            SeriesFrequency.Monthly => $"{(n == 1 ? "every month" : $"every {n} months")} on the {Ordinal(dates[0].Day)}",
            _ => $"{(n == 1 ? "every week" : $"every {n} weeks")} on {DayList(EventSchedule.FromFlags(series.Days))}",
        };
        var first = string.Join(", ", dates.Take(shown).Select(d => d.ToString("MMM d", CultureInfo.InvariantCulture)));
        var rest = dates.Count > shown ? $" … {dates[^1].ToString("MMM d", CultureInfo.InvariantCulture)}" : "";
        var summary = $"Add: {events[0].Title}, {every}, {dates.Count} dates: {first}{rest}";
        return summary.Length <= SummaryMaxLength ? summary : $"{summary[..(SummaryMaxLength - 1)]}…";
    }

    /// <summary>The approvals module's limit on a request summary.</summary>
    private const int SummaryMaxLength = 200;

    /// <summary>"Tue", "Tue and Thu", "Mon, Wed and Fri".</summary>
    private static string DayList(IReadOnlyList<DayOfWeek> days)
    {
        var names = days.Select(d => CultureInfo.InvariantCulture.DateTimeFormat.GetAbbreviatedDayName(d)).ToList();
        return names.Count > 1 ? $"{string.Join(", ", names[..^1])} and {names[^1]}" : names.FirstOrDefault() ?? "";
    }

    /// <summary>"1st", "2nd", "23rd", "31st".</summary>
    private static string Ordinal(int day) =>
        day + (day % 100 is 11 or 12 or 13 ? "th" : (day % 10) switch { 1 => "st", 2 => "nd", 3 => "rd", _ => "th" });

    /// <summary>
    /// Changing or cancelling several dates of repeating parenting time at once would skip the co-parent's approval, so
    /// for now each date is changed on its own, through approval as usual (#239 follow-up in TODO.md).
    /// </summary>
    // TODO(calendar): one approval request for changing several dates of repeating parenting time (TODO.md, #239).
    private static ValidationProblem OneDateAtATime() => TypedResults.ValidationProblem(new Dictionary<string, string[]>
    {
        ["scope"] = ["Change repeating parenting time one date at a time for now. Each change goes to your co-parent."],
    });

    /// <summary>
    /// Edits this and the following dates, or every date, of a repeating event (#193), at once: series never need
    /// approval. Only the fields sent change, so a date edited on its own keeps its other differences. Each date keeps
    /// its own day; times change as a time of day. Moving the dates to other weekdays isn't supported: cancel them from
    /// that date and add them again.
    /// </summary>
    private static async Task<Results<Ok<EventView>, Accepted<EventView>, NotFound, ValidationProblem, ProblemHttpResult, ForbidHttpResult>> UpdateSeriesAsync(
        CalendarEvent e,
        EditScope scope,
        UpdateEventRequest request,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        CancellationToken cancellationToken)
    {
        var zone = await roster.TimeZoneAsync(cancellationToken);
        var current = e.Current();
        var change = new ProposedTimes(
            string.IsNullOrWhiteSpace(request.Title) ? current.Title : request.Title.Trim(),
            request.StartsAt?.ToUniversalTime() ?? current.StartsAt,
            request.EndsAt?.ToUniversalTime() ?? current.EndsAt,
            request.AllDay ?? current.AllDay,
            request.Location is null ? current.Location : (string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim()),
            null);
        change = UnavailableSafe(e.Category, change);
        var errors = ValidateChange(change, e.Category, await roster.ActiveParentMembershipIdsAsync(cancellationToken), request.Notes);
        if (errors.Count == 0 && request.StartsAt is not null
            && EventSchedule.LocalDate(change.StartsAt, zone) != EventSchedule.LocalDate(e.StartsAt, zone))
        {
            errors["startsAt"] =
            [
                "A change to several dates keeps each on its own day. To move them to other days, cancel them from this date and add them again.",
            ];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var seriesId = e.SeriesId!.Value;
        var targets = await SeriesTargetsAsync(db, seriesId, e, scope, cancellationToken);
        var notes = request.Notes is null ? null : (string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim());
        var retime = request.StartsAt is not null || request.EndsAt is not null || request.AllDay is not null;
        var dates = new List<(DateTimeOffset Start, DateTimeOffset End)>();
        foreach (var target in targets)
        {
            // Only what the parent changed: a date that was renamed or moved on its own keeps that, unless this edit
            // changes the same field.
            var own = target.Current();
            var (start, end) = retime
                ? EventSchedule.Retime(target.StartsAt, change.StartsAt, change.EndsAt, zone)
                : (own.StartsAt, own.EndsAt);
            target.Apply(own with
            {
                Title = string.IsNullOrWhiteSpace(request.Title) && e.Category != EventCategory.Unavailable ? own.Title : change.Title,
                StartsAt = start,
                EndsAt = end,
                AllDay = request.AllDay ?? own.AllDay,
                Location = request.Location is null && e.Category != EventCategory.Unavailable ? own.Location : change.Location,
            });
            if (request.Notes is not null)
            {
                target.Notes = notes;
            }

            dates.Add((start, end));
        }

        if (retime)
        {
            // Checked for every date before saving, so no date of the series changes unless all of them can.
            var clash = await OwnOverlapErrorsAsync(db, e.Category, e.OwnerMembershipId, dates, cancellationToken);
            if (clash.Count > 0)
            {
                return TypedResults.ValidationProblem(clash);
            }
        }

        var warnings = await SeriesWarningsAsync(db, e.Category, e.OwnerMembershipId, dates, cancellationToken);
        var series = await SeriesForAsync(db, tenant, [e], cancellationToken);
        var userId = http.User.GetUserId()!.Value;
        Dictionary<string, string[]>? refused = null;
        await unitOfWork.ExecuteAsync(async ct =>
        {
            if (retime && (refused = await RefusedUnderLockAsync(db, e.Category, e.OwnerMembershipId, dates, ct)) is not null)
            {
                return;
            }

            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "calendar_series.updated", "calendar_series", seriesId), ct);
        }, cancellationToken);

        if (refused is not null)
        {
            return TypedResults.ValidationProblem(refused);
        }

        return TypedResults.Ok(View(e, tenant, changeRequestId: null, warnings, series));
    }

    /// <summary>The confirmed dates a scope covers: from this one on, or all of them.</summary>
    private static Task<List<CalendarEvent>> SeriesTargetsAsync(
        CalendarDbContext db, Guid seriesId, CalendarEvent from, EditScope scope, CancellationToken cancellationToken) =>
        db.Events
            .Where(x => x.SeriesId == seriesId && x.Status == EventStatus.Confirmed && (scope == EditScope.All || x.StartsAt >= from.StartsAt))
            .OrderBy(x => x.StartsAt)
            .ToListAsync(cancellationToken);

    private static string Unit(SeriesFrequency frequency) => frequency switch
    {
        SeriesFrequency.Daily => "day",
        SeriesFrequency.Monthly => "month",
        _ => "week",
    };

    /// <summary>The series behind these events, for "Repeats …" in their details. Children never see it.</summary>
    private static async Task<IReadOnlyDictionary<Guid, CalendarSeries>> SeriesForAsync(
        CalendarDbContext db, ITenantContext tenant, IEnumerable<CalendarEvent> events, CancellationToken cancellationToken)
    {
        var ids = events.Select(e => e.SeriesId).OfType<Guid>().Distinct().ToList();
        return ids.Count == 0 || tenant.Role == FamilyRole.Child
            ? new Dictionary<Guid, CalendarSeries>()
            : await db.Series.Where(s => ids.Contains(s.Id)).ToDictionaryAsync(s => s.Id, cancellationToken);
    }

    /// <summary>
    /// The series' gentle warnings, once for all its dates: new unavailable time over the owner's own confirmed
    /// parenting time (as for a single date). Activities get none.
    /// </summary>
    private static async Task<IReadOnlyList<string>> SeriesWarningsAsync(
        CalendarDbContext db,
        EventCategory category,
        Guid owner,
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> dates,
        CancellationToken cancellationToken)
    {
        if (category != EventCategory.Unavailable || dates.Count == 0)
        {
            return [];
        }

        var (first, last) = (dates.Min(d => d.Start), dates.Max(d => d.End));
        var parenting = await db.Events
            .Where(x => x.Category == EventCategory.ParentingTime && x.Status == EventStatus.Confirmed
                && x.CaregiverMembershipId == owner && x.StartsAt < last && x.EndsAt > first)
            .Select(x => new { x.StartsAt, x.EndsAt })
            .ToListAsync(cancellationToken);
        return parenting.Any(p => dates.Any(d => d.Start < p.EndsAt && d.End > p.StartsAt)) ? [OverlapsYourParentingTime] : [];
    }

    /// <summary>Error key: the parenting time's caregiver marked themselves unavailable then (#210).</summary>
    public const string CaregiverUnavailableError = "caregiverUnavailable";

    /// <summary>Error key: the unavailable time overlaps the owner's own pending or confirmed parenting time (#210).</summary>
    public const string OverlapsYourParentingTimeError = "overlapsYourParentingTime";

    /// <summary>
    /// A parent can't have the children and be unavailable at the same time (owner decisions, October 22, 2026; #210).
    /// Parenting time can't overlap its caregiver's unavailable time, whoever adds it; unavailable time can't overlap
    /// the owner's pending or confirmed parenting time (including a change waiting for approval). Declined, withdrawn
    /// and cancelled items don't count. The message never shows the unavailable time's private details.
    /// </summary>
    private static async Task<Dictionary<string, string[]>> OwnOverlapErrorsAsync(
        CalendarDbContext db,
        EventCategory category,
        Guid? person,
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> dates,
        CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        if (person is not { } who || dates.Count == 0
            || category is not (EventCategory.ParentingTime or EventCategory.Unavailable))
        {
            return errors;
        }

        var (first, last) = (dates.Min(d => d.Start), dates.Max(d => d.End));
        bool Overlaps(DateTimeOffset start, DateTimeOffset end) => dates.Any(d => d.Start < end && d.End > start);

        if (category == EventCategory.ParentingTime)
        {
            var unavailable = await db.Events
                .Where(x => x.Category == EventCategory.Unavailable && x.Status == EventStatus.Confirmed
                    && x.OwnerMembershipId == who && x.StartsAt < last && x.EndsAt > first)
                .Select(x => new { x.StartsAt, x.EndsAt })
                .ToListAsync(cancellationToken);
            if (unavailable.Any(u => Overlaps(u.StartsAt, u.EndsAt)))
            {
                errors[CaregiverUnavailableError] =
                    ["The parent with the children is unavailable then. Choose another time, or another parent."];
            }

            return errors;
        }

        var parenting = await db.Events
            .Where(x => x.Category == EventCategory.ParentingTime
                && (x.Status == EventStatus.Confirmed || x.Status == EventStatus.PendingApproval)
                && ((x.CaregiverMembershipId == who && x.StartsAt < last && x.EndsAt > first)
                    || (x.PendingChange == PendingChange.Modify && x.Proposed!.CaregiverMembershipId == who
                        && x.Proposed.StartsAt < last && x.Proposed.EndsAt > first)))
            .Select(x => new
            {
                x.CaregiverMembershipId,
                x.StartsAt,
                x.EndsAt,
                Modify = x.PendingChange == PendingChange.Modify,
                ProposedCaregiver = x.Proposed!.CaregiverMembershipId,
                ProposedStartsAt = (DateTimeOffset?)x.Proposed.StartsAt,
                ProposedEndsAt = (DateTimeOffset?)x.Proposed.EndsAt,
            })
            .ToListAsync(cancellationToken);
        if (parenting.Any(p => (p.CaregiverMembershipId == who && Overlaps(p.StartsAt, p.EndsAt))
            || (p.Modify && p.ProposedCaregiver == who && p.ProposedStartsAt is { } start && p.ProposedEndsAt is { } end
                && Overlaps(start, end))))
        {
            errors[OverlapsYourParentingTimeError] =
                ["You have parenting time then. Choose another time, or change that parenting time first."];
        }

        return errors;
    }

    /// <summary>
    /// The same check again, inside the save's transaction and under a lock on that parent, so two requests at the same
    /// moment (Dad's unavailable time and Mom's proposal of his parenting time, say) can't both pass and create the
    /// overlap (#210). Every write that this rule checks takes the parent's lock first, so they run one after the other
    /// and the second sees the first. The lock ends with the transaction. Null when the change may be saved.
    /// </summary>
    internal static async Task<Dictionary<string, string[]>?> RefusedUnderLockAsync(
        CalendarDbContext db,
        EventCategory category,
        Guid? person,
        IReadOnlyList<(DateTimeOffset Start, DateTimeOffset End)> dates,
        CancellationToken cancellationToken)
    {
        if (person is not { } who || category is not (EventCategory.ParentingTime or EventCategory.Unavailable))
        {
            return null;
        }

        var key = OverlapLockKey(who);
        await db.Database.SqlQuery<int>($"SELECT 1 AS \"Value\" FROM pg_advisory_xact_lock({OverlapLockClass}, {key})")
            .ToListAsync(cancellationToken);
        var errors = await OwnOverlapErrorsAsync(db, category, who, dates, cancellationToken);
        return errors.Count > 0 ? errors : null;
    }

    /// <summary>The advisory-lock namespace for a parent's own-overlap check ("CAL1").</summary>
    private const int OverlapLockClass = 0x43414C31;

    /// <summary>A stable 32-bit key for a parent's membership; two parents sharing one only wait for each other.</summary>
    private static int OverlapLockKey(Guid membershipId)
    {
        Span<byte> bytes = stackalloc byte[16];
        membershipId.TryWriteBytes(bytes);
        return BitConverter.ToInt32(bytes[..4]) ^ BitConverter.ToInt32(bytes[4..8])
            ^ BitConverter.ToInt32(bytes[8..12]) ^ BitConverter.ToInt32(bytes[12..]);
    }

    private static EditScope? ParseScope(string? scope) =>
        string.IsNullOrEmpty(scope)
            ? EditScope.This
            : Enum.TryParse<EditScope>(scope, ignoreCase: true, out var parsed) && Enum.IsDefined(parsed) && !int.TryParse(scope, out _)
                ? parsed
                : null;

    private static ValidationProblem InvalidScope() => TypedResults.ValidationProblem(new Dictionary<string, string[]>
    {
        ["scope"] = ["Choose this event, this and following, or all events."],
    });

    private static ProblemHttpResult RequestWaiting(string detail) => TypedResults.Problem(
        title: "This event already has a request waiting for an answer.", detail: detail, statusCode: StatusCodes.Status409Conflict);

    private static Dictionary<string, string[]> ValidateChange(
        ProposedTimes change, EventCategory category, IReadOnlySet<Guid> parents, string? notes)
    {
        var errors = new Dictionary<string, string[]>();
        if (change.Title.Length is 0 or > CalendarEvent.TitleMaxLength)
        {
            errors["title"] = [$"Enter a title of 1 to {CalendarEvent.TitleMaxLength} characters."];
        }

        if (change.EndsAt <= change.StartsAt)
        {
            errors["endsAt"] = ["Choose an end that's after the start."];
        }
        else if (change.EndsAt - change.StartsAt > MaxDuration)
        {
            errors["endsAt"] = [$"An event can last up to {MaxDuration.TotalDays:0} days."];
        }

        if ((change.Location?.Length ?? 0) > CalendarEvent.LocationMaxLength)
        {
            errors["location"] = [$"Keep the location under {CalendarEvent.LocationMaxLength} characters."];
        }

        if ((notes?.Length ?? 0) > CalendarEvent.NotesMaxLength)
        {
            errors["notes"] = [$"Keep notes under {CalendarEvent.NotesMaxLength} characters."];
        }

        if (category == EventCategory.ParentingTime
            && (change.CaregiverMembershipId is not { } caregiver || !parents.Contains(caregiver)))
        {
            errors["caregiverMembershipId"] = ["Choose which parent has the children."];
        }

        return errors;
    }

    /// <summary>Parenting time for a child that overlaps another parenting-time block for the same child (C-06).</summary>
    public const string OverlapsParentingTime = "OverlapsParentingTime";

    /// <summary>The caregiving parent marked themselves unavailable then: suggest arranging coverage, never reassign.</summary>
    public const string CaregiverUnavailable = "CaregiverUnavailable";

    /// <summary>New unavailable time overlaps the owner's own confirmed parenting time.</summary>
    public const string OverlapsYourParentingTime = "OverlapsYourParentingTime";

    /// <summary>
    /// Gentle, non-blocking conflict warnings (CALENDAR_DECISIONS.md, C-06). They inform; they never block a request
    /// or change anyone's parenting time.
    /// </summary>
    private static async Task<IReadOnlyList<string>> WarningsAsync(
        CalendarDbContext db, WarningCheck check, CancellationToken cancellationToken)
    {
        var (category, starts, ends, proposer) = (check.Category, check.StartsAt, check.EndsAt, check.ProposerMembershipId);
        var overlapping = db.Events.Where(x => x.Id != check.ExcludeEventId
            && x.StartsAt < ends
            && x.EndsAt > starts
            && (x.Status == EventStatus.Confirmed || x.Status == EventStatus.PendingApproval));
        var warnings = new List<string>();

        if (category == EventCategory.ParentingTime)
        {
            var unavailable = await overlapping
                .Where(x => x.Category == EventCategory.Unavailable && x.Status == EventStatus.Confirmed)
                .Select(x => x.OwnerMembershipId)
                .ToListAsync(cancellationToken);
            if (unavailable.Any(owner => owner != proposer))
            {
                warnings.Add(OverlapsCoParentUnavailable);
            }

            if (check.CaregiverMembershipId is { } caregiver && unavailable.Contains(caregiver))
            {
                warnings.Add(CaregiverUnavailable);
            }

            var childIds = check.ChildIds;
            if (await overlapping.AnyAsync(
                    x => x.Category == EventCategory.ParentingTime && x.Children.Any(c => childIds.Contains(c.ChildProfileId)),
                    cancellationToken))
            {
                warnings.Add(OverlapsParentingTime);
            }
        }
        else if (category == EventCategory.Unavailable
            && await overlapping.AnyAsync(
                x => x.Category == EventCategory.ParentingTime && x.Status == EventStatus.Confirmed && x.CaregiverMembershipId == proposer,
                cancellationToken))
        {
            warnings.Add(OverlapsYourParentingTime);
        }

        return warnings;
    }

    private sealed record WarningCheck(
        EventCategory Category,
        DateTimeOffset StartsAt,
        DateTimeOffset EndsAt,
        Guid ProposerMembershipId,
        Guid? CaregiverMembershipId,
        IReadOnlyList<Guid> ChildIds,
        Guid? ExcludeEventId);

    private static Dictionary<string, string[]> Validate(
        CreateEventRequest request, IReadOnlySet<Guid> children, IReadOnlySet<Guid> parents)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.Category is not { } category)
        {
            errors["category"] = ["Choose what kind of event this is."];
            return errors;
        }

        var title = request.Title?.Trim() ?? "";
        if ((category != EventCategory.Unavailable && title.Length == 0) || title.Length > CalendarEvent.TitleMaxLength)
        {
            errors["title"] = [$"Enter a title of 1 to {CalendarEvent.TitleMaxLength} characters."];
        }

        if (request.StartsAt is not { } starts || request.EndsAt is not { } ends || ends <= starts)
        {
            errors["endsAt"] = ["Choose an end that's after the start."];
        }
        else if (ends - starts > MaxDuration)
        {
            errors["endsAt"] = [$"An event can last up to {MaxDuration.TotalDays:0} days."];
        }

        if ((request.Location?.Length ?? 0) > CalendarEvent.LocationMaxLength)
        {
            errors["location"] = [$"Keep the location under {CalendarEvent.LocationMaxLength} characters."];
        }

        if ((request.Notes?.Length ?? 0) > CalendarEvent.NotesMaxLength)
        {
            errors["notes"] = [$"Keep notes under {CalendarEvent.NotesMaxLength} characters."];
        }

        var childIds = request.ChildIds ?? [];
        if (childIds.Any(id => !children.Contains(id)))
        {
            errors["childIds"] = ["Choose children who are in this family (and approved by both parents)."];
        }
        else if (category == EventCategory.Unavailable && childIds.Count > 0)
        {
            errors["childIds"] = ["Unavailable time is about you, so it doesn't include children."];
        }
        else if (category == EventCategory.ParentingTime && childIds.Count == 0)
        {
            errors["childIds"] = ["Choose which children this parenting time is for."];
        }

        if (category == EventCategory.ParentingTime
            && (request.CaregiverMembershipId is not { } caregiver || !parents.Contains(caregiver)))
        {
            errors["caregiverMembershipId"] = ["Choose which parent has the children."];
        }

        return errors;
    }

    private static string Summary(CalendarEvent e) =>
        $"{(e.Category == EventCategory.Joint ? "Family event" : "Add")}: {e.Title}, {e.StartsAt:MMM d}";

    private const string UnavailableTitle = "Unavailable";

    /// <summary>
    /// Unavailable time is shared only as "Unavailable": its private reason belongs in the owner-only notes. So it's
    /// stored with that title and no location, whatever the request sends.
    /// </summary>
    private static (string Title, string? Location) Shareable(EventCategory category, string? title, string? location) =>
        category == EventCategory.Unavailable
            ? (UnavailableTitle, null)
            : (string.IsNullOrWhiteSpace(title) ? UnavailableTitle : title.Trim(), string.IsNullOrWhiteSpace(location) ? null : location.Trim());

    private static ProposedTimes UnavailableSafe(EventCategory category, ProposedTimes change) =>
        category == EventCategory.Unavailable ? change with { Title = UnavailableTitle, Location = null } : change;

    /// <summary>
    /// Whether this viewer sees only "Unavailable": anyone but its owner. Also covers anything stored before titles
    /// and locations were normalized.
    /// </summary>
    private static bool HiddenFrom(CalendarEvent e, ITenantContext tenant) =>
        e.Category == EventCategory.Unavailable && (tenant.Role == FamilyRole.Child || e.OwnerMembershipId != tenant.MembershipId);

    private static EventView View(
        CalendarEvent e,
        ITenantContext tenant,
        Guid? changeRequestId,
        IReadOnlyList<string> warnings,
        IReadOnlyDictionary<Guid, CalendarSeries>? series = null) => new(
        e.Id,
        HiddenFrom(e, tenant) ? UnavailableTitle : e.Title,
        e.Category,
        e.StartsAt,
        e.EndsAt,
        e.AllDay,
        HiddenFrom(e, tenant) ? null : e.Location,
        Notes: tenant.Role == FamilyRole.Child || (e.Category == EventCategory.Unavailable && e.OwnerMembershipId != tenant.MembershipId)
            ? null
            : e.Notes,
        e.Status,
        e.Children.Select(c => c.ChildProfileId).ToList(),
        e.CaregiverMembershipId,
        e.OwnerMembershipId,
        e.ConfirmedBeforeCoParentJoined,
        changeRequestId,
        // Children never see pending changes (they never see approvals or disagreements).
        tenant.Role == FamilyRole.Child ? PendingChange.None : e.PendingChange,
        tenant.Role == FamilyRole.Child ? null : e.Proposed,
        warnings,
        tenant.Role == FamilyRole.Child ? null : e.SeriesId,
        tenant.Role != FamilyRole.Child && e.SeriesId is { } id && series?.GetValueOrDefault(id) is { } r
            ? new SeriesView(EventSchedule.FromFlags(r.Days), r.Until, r.Count, r.Frequency, r.Interval)
            : null);
}
