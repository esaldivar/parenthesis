namespace CoParent.Modules.Identity.Contracts;

/// <summary>Read-only facts about users that other modules may show, such as a member's display name.</summary>
public interface IUserDirectory
{
    /// <summary>Display names keyed by user id. Unknown ids are left out.</summary>
    Task<IReadOnlyDictionary<Guid, string>> GetDisplayNamesAsync(
        IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// The account registered to <paramref name="email"/>, if any. Callers must never reveal the answer to someone other
    /// than the account's owner (e.g. invitations always say "sent"), so the app can't be used to look people up.
    /// </summary>
    Task<DirectoryUser?> FindByEmailAsync(string email, CancellationToken cancellationToken = default);

    Task<DirectoryUser?> FindByIdAsync(Guid userId, CancellationToken cancellationToken = default);
}

public sealed record DirectoryUser(Guid Id, string DisplayName, string Email, bool EmailConfirmed);
