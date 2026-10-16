namespace CoParent.Modules.Identity.Contracts;

/// <summary>Read-only facts about users that other modules may show, such as a member's display name.</summary>
public interface IUserDirectory
{
    /// <summary>Display names keyed by user id. Unknown ids are left out.</summary>
    Task<IReadOnlyDictionary<Guid, string>> GetDisplayNamesAsync(
        IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default);
}
