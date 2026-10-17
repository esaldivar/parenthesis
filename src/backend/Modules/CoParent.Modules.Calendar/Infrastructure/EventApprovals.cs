using CoParent.Modules.Approvals.Contracts;
using CoParent.Modules.Calendar.Domain;
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
        var calendarEvent = await db.Events.SingleAsync(e => e.Id == target.TargetId, cancellationToken);
        calendarEvent.Status = status;
        await db.SaveChangesAsync(cancellationToken);
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
