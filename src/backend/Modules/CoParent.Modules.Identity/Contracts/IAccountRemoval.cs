namespace CoParent.Modules.Identity.Contracts;

/// <summary>Lets the account-deletion flow (A-12) check the password and remove the sign-in account.</summary>
public interface IAccountRemoval
{
    /// <summary>
    /// Whether <paramref name="password"/> is the user's password. Failures count toward the normal sign-in lockout,
    /// so this can't be used to guess passwords.
    /// </summary>
    Task<bool> CheckPasswordAsync(Guid userId, string password, CancellationToken cancellationToken = default);

    /// <summary>Permanently deletes the user's sign-in account: email, name, password and tokens.</summary>
    Task DeleteAsync(Guid userId, CancellationToken cancellationToken = default);
}
