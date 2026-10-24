using CoParent.Modules.Identity.Contracts;
using CoParent.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;

namespace CoParent.Modules.Identity.Infrastructure;

internal sealed class AccountRemoval(UserManager<AppUser> users, SignInManager<AppUser> signIn) : IAccountRemoval
{
    public async Task<bool> CheckPasswordAsync(Guid userId, string password, CancellationToken cancellationToken = default)
    {
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return false;
        }

        var result = await signIn.CheckPasswordSignInAsync(user, password, lockoutOnFailure: true);
        return result.Succeeded;
    }

    public async Task DeleteAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var user = await users.FindByIdAsync(userId.ToString());
        if (user is null)
        {
            return;
        }

        var result = await users.DeleteAsync(user);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException("The account could not be deleted.");
        }
    }
}
