namespace CoParent.SharedKernel.Accounts;

/// <summary>
/// A parent leaving a family because they deleted their account (A-12). When <see cref="FamilyClosing"/> is true they
/// were its only parent, so the whole family is being deleted; otherwise the family stays with the co-parent.
/// </summary>
public sealed record ParentDeparture(Guid FamilyId, Guid MembershipId, bool FamilyClosing);

/// <summary>
/// Implemented by each module that keeps family data. Runs in the departing family's tenant and unit of work, after
/// the membership is marked as left (so active-parent counts already exclude it), and must save its own changes.
/// </summary>
public interface IParentDepartureHandler
{
    /// <summary>Lower runs first.</summary>
    int Order { get; }

    Task HandleAsync(ParentDeparture departure, CancellationToken cancellationToken);
}
