using System.Security.Claims;
using CoParent.Modules.Identity.Contracts;
using CoParent.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;

namespace CoParent.Modules.Identity.Infrastructure;

internal sealed class ParentSessions(UserManager<AppUser> users, SignInManager<AppUser> signIn) : IParentSessions
{
    public async Task<bool> SignInOnSharedDeviceAsync(Guid userId, Guid deviceId, CancellationToken cancellationToken = default)
    {
        if (await users.FindByIdAsync(userId.ToString()) is not { } user
            || !await signIn.CanSignInAsync(user)
            || await users.IsLockedOutAsync(user))
        {
            return false;
        }

        await signIn.SignInWithClaimsAsync(user, isPersistent: true, [new Claim(SharedDeviceClaims.DeviceId, deviceId.ToString())]);
        return true;
    }
}
