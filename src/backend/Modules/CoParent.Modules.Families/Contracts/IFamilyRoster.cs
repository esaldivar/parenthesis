namespace CoParent.Modules.Families.Contracts;

/// <summary>Who's in the current family, for other modules (e.g. Calendar). Reads are scoped to the request's tenant.</summary>
public interface IFamilyRoster
{
    /// <summary>Children approved by both parents. Pending, rejected or archived children aren't included.</summary>
    Task<IReadOnlySet<Guid>> ActiveChildIdsAsync(CancellationToken cancellationToken = default);

    /// <summary>Membership ids of the family's active parents.</summary>
    Task<IReadOnlySet<Guid>> ActiveParentMembershipIdsAsync(CancellationToken cancellationToken = default);

    /// <summary>The family's IANA time zone (e.g. "America/Chicago"), for anything that repeats on local dates.</summary>
    Task<string> TimeZoneAsync(CancellationToken cancellationToken = default);
}
