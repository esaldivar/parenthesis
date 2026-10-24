using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Calendar.Domain;
using CoParent.Modules.Calendar.Endpoints;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>Confirms or rejects a proposed event once the parents decide (ADR-0003, AP-03).</summary>
internal abstract class EventCreateHandler(CalendarDbContext db) : IApprovalTargetHandler
{
    public abstract string Type { get; }

    public abstract int MinimumApprovals { get; }

    public Task ApplyAsync(ApprovalTarget target, CancellationToken cancellationToken) =>
        SetStatusAsync(target, EventStatus.Confirmed, cancellationToken);

    public Task RejectAsync(ApprovalTarget target, CancellationToken cancellationToken) =>
        SetStatusAsync(target, EventStatus.Rejected, cancellationToken);

    private async Task SetStatusAsync(ApprovalTarget target, EventStatus status, CancellationToken cancellationToken)
    {
        // A repeating parenting-time request covers every date of its series at once (#239).
        var events = target.TargetType == CalendarEndpoints.SeriesTarget
            ? await db.Events.Where(e => e.SeriesId == target.TargetId && e.Status == EventStatus.PendingApproval).ToListAsync(cancellationToken)
            : [await db.Events.SingleAsync(e => e.Id == target.TargetId, cancellationToken)];
        if (status == EventStatus.Confirmed)
        {
            await RefuseIfCaregiverUnavailableAsync(events, cancellationToken);
        }

        foreach (var calendarEvent in events)
        {
            calendarEvent.Status = status;
            // Only a parent's Decline shows on the calendar as declined (#199); a withdrawn or expired request just goes.
            calendarEvent.DeclinedByParent = status == EventStatus.Rejected && target.DeclinedByParent;
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Parenting time is checked again as it's confirmed, under the caregiver's lock (#210): a parent can't have the
    /// children and be unavailable at once, however the time passed while the request waited. Every date of a
    /// repeating request is checked together (#239); if any clashes, none is confirmed.
    /// </summary>
    private async Task RefuseIfCaregiverUnavailableAsync(List<CalendarEvent> events, CancellationToken cancellationToken)
    {
        foreach (var dates in events
            .Where(e => e.Category == EventCategory.ParentingTime && e.CaregiverMembershipId is not null)
            .GroupBy(e => e.CaregiverMembershipId))
        {
            var refused = await CalendarEndpoints.RefusedUnderLockAsync(
                db, EventCategory.ParentingTime, dates.Key, dates.Select(e => (e.StartsAt, e.EndsAt)).ToList(), cancellationToken);
            if (refused is not null)
            {
                throw new ApprovalRefusedException(refused.Values.First()[0]);
            }
        }
    }
}

internal sealed class CalendarCreateHandler(CalendarDbContext db) : EventCreateHandler(db)
{
    public override string Type => ChangeRequestTypes.CalendarCreate;

    public override int MinimumApprovals => 1;
}

internal sealed class JointEventCreateHandler(CalendarDbContext db) : EventCreateHandler(db)
{
    public override string Type => ChangeRequestTypes.JointEventCreate;

    public override int MinimumApprovals => 2;
}

/// <summary>Applies or discards a proposed change to a confirmed event.</summary>
internal sealed class CalendarModifyHandler(CalendarDbContext db) : IApprovalTargetHandler
{
    public string Type => ChangeRequestTypes.CalendarModify;

    public int MinimumApprovals => 1;

    public async Task ApplyAsync(ApprovalTarget target, CancellationToken cancellationToken)
    {
        var calendarEvent = await db.Events.SingleAsync(e => e.Id == target.TargetId, cancellationToken);
        if (calendarEvent.Proposed is { } proposed)
        {
            calendarEvent.Apply(proposed);
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task RejectAsync(ApprovalTarget target, CancellationToken cancellationToken)
    {
        var calendarEvent = await db.Events.SingleAsync(e => e.Id == target.TargetId, cancellationToken);
        calendarEvent.ClearPendingChange();
        await db.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>Cancels a confirmed event once approved; declining keeps it.</summary>
internal sealed class CalendarCancelHandler(CalendarDbContext db) : IApprovalTargetHandler
{
    public string Type => ChangeRequestTypes.CalendarCancel;

    public int MinimumApprovals => 1;

    public async Task ApplyAsync(ApprovalTarget target, CancellationToken cancellationToken)
    {
        var calendarEvent = await db.Events.SingleAsync(e => e.Id == target.TargetId, cancellationToken);
        calendarEvent.Status = EventStatus.Cancelled;
        calendarEvent.ClearPendingChange();
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task RejectAsync(ApprovalTarget target, CancellationToken cancellationToken)
    {
        var calendarEvent = await db.Events.SingleAsync(e => e.Id == target.TargetId, cancellationToken);
        calendarEvent.ClearPendingChange();
        await db.SaveChangesAsync(cancellationToken);
    }
}
