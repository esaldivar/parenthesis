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
    Guid? CaregiverMembershipId);

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
    IReadOnlyList<string> Warnings);

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
    }

    /// <summary>Non-blocking: the proposed parenting time overlaps the other parent's unavailable time (CALENDAR_DECISIONS.md).</summary>
    public const string OverlapsCoParentUnavailable = "OverlapsCoParentUnavailable";

    /// <summary>
    /// Events overlapping [from, to). Parents see pending and confirmed events; an Unavailable event's notes are shown
    /// only to its owner. A child sees only confirmed events that include them, with no notes, no unavailability and
    /// nothing pending (children never see approvals or disagreements).
    /// </summary>
    private static async Task<Results<Ok<List<EventView>>, ValidationProblem>> ListAsync(
        DateTimeOffset from, DateTimeOffset to, ITenantContext tenant, CalendarDbContext db, CancellationToken cancellationToken)
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
            : query.Where(e => e.Status == EventStatus.Confirmed || e.Status == EventStatus.PendingApproval);

        var events = await query.OrderBy(e => e.StartsAt).ToListAsync(cancellationToken);
        return TypedResults.Ok(events.Select(e => View(e, tenant, changeRequestId: null, [])).ToList());
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
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var children = await roster.ActiveChildIdsAsync(cancellationToken);
        var parents = await roster.ActiveParentMembershipIdsAsync(cancellationToken);
        var errors = Validate(request, children, parents);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var category = request.Category!.Value;
        var title = string.IsNullOrWhiteSpace(request.Title) ? "Unavailable" : request.Title.Trim();
        var needsApproval = CalendarEvent.NeedsApproval(category);

        // Decision 7: while a family has one parent, approval-gated events are confirmed and labelled, so the
        // co-parent can review them when they join. A joint event always waits for both parents.
        var soloConfirm = needsApproval && category != EventCategory.Joint && parents.Count < 2;
        var calendarEvent = new CalendarEvent
        {
            FamilyId = tenant.FamilyId,
            Title = title,
            Category = category,
            StartsAt = request.StartsAt!.Value.ToUniversalTime(),
            EndsAt = request.EndsAt!.Value.ToUniversalTime(),
            AllDay = request.AllDay,
            Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim(),
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
        await unitOfWork.ExecuteAsync(async ct =>
        {
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

        return TypedResults.Created(
            $"/api/families/{tenant.FamilyId}/calendar/events/{calendarEvent.Id}",
            View(calendarEvent, tenant, changeRequestId, warnings));
    }

    /// <summary>One event, for a parent: the same view the list gives (an Unavailable event's notes only to its owner).</summary>
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
        return e is null ? TypedResults.NotFound() : TypedResults.Ok(View(e, tenant, changeRequestId: null, []));
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
            return RequestWaiting("Wait for your co-parent's answer, or withdraw the request, before changing it again.");
        }

        var current = e.Current();
        var change = new ProposedTimes(
            string.IsNullOrWhiteSpace(request.Title) ? current.Title : request.Title.Trim(),
            request.StartsAt?.ToUniversalTime() ?? current.StartsAt,
            request.EndsAt?.ToUniversalTime() ?? current.EndsAt,
            request.AllDay ?? current.AllDay,
            request.Location is null ? current.Location : (string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim()),
            e.Category == EventCategory.ParentingTime ? request.CaregiverMembershipId ?? current.CaregiverMembershipId : null);

        var parents = await roster.ActiveParentMembershipIdsAsync(cancellationToken);
        var errors = ValidateChange(change, e.Category, parents, request.Notes);
        if ((request.Reason?.Trim().Length ?? 0) > ChangeRequestProposal.ReasonMaxLength)
        {
            errors["reason"] = [$"Keep the reason under {ChangeRequestProposal.ReasonMaxLength} characters."];
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
        await unitOfWork.ExecuteAsync(async ct =>
        {
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

        var view = View(e, tenant, changeRequestId, warnings);
        return needsApproval ? TypedResults.Accepted((string?)null, view) : TypedResults.Ok(view);
    }

    /// <summary>
    /// Cancels an event. Activities and unavailable time cancel at once; a confirmed approval-gated event gets a
    /// CalendarCancel request. A still-pending event is withdrawn from the approvals inbox instead.
    /// </summary>
    private static async Task<Results<NoContent, Accepted<EventView>, NotFound, ProblemHttpResult, ForbidHttpResult>> CancelAsync(
        Guid eventId,
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

    private static EventView View(CalendarEvent e, ITenantContext tenant, Guid? changeRequestId, IReadOnlyList<string> warnings) => new(
        e.Id,
        e.Title,
        e.Category,
        e.StartsAt,
        e.EndsAt,
        e.AllDay,
        e.Location,
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
        warnings);
}
