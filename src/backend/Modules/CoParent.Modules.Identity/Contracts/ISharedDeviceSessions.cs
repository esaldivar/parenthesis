using Microsoft.AspNetCore.Http;

namespace CoParent.Modules.Identity.Contracts;

/// <summary>
/// A parent session started on a shared family device carries that device's id, so revoking the device, its 30-day
/// expiry, or the parent losing family access ends the session on the next request (#153, ADR-0007).
/// </summary>
public static class SharedDeviceClaims
{
    public const string DeviceId = "parenthesis:shared_device";
}

/// <summary>Implemented by the Families module, which owns devices and memberships.</summary>
public interface ISharedDeviceSessions
{
    /// <summary>
    /// The usable shared device this browser holds for <paramref name="userId"/> (set up by one of their active parent
    /// memberships), or null. Used to bind a password sign-in on that device to it.
    /// </summary>
    Task<Guid?> FindForParentAsync(HttpContext http, Guid userId, CancellationToken cancellationToken = default);

    /// <summary>Whether a parent session bound to <paramref name="deviceId"/> may continue.</summary>
    Task<bool> IsParentSessionValidAsync(Guid deviceId, Guid userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Full sign-out: removes this browser's shared device when it belongs to <paramref name="userId"/>, so the picker
    /// is gone until a parent signs in and sets the device up again.
    /// </summary>
    Task ForgetOnSignOutAsync(HttpContext http, Guid userId, CancellationToken cancellationToken = default);
}

/// <summary>Starts a parent's own session from the Families module, after their parent PIN or shared-device setup.</summary>
public interface IParentSessions
{
    /// <summary>
    /// Signs the user in on this browser, bound to <paramref name="deviceId"/>. Returns false, and signs nobody in, when
    /// the account can't sign in right now (unknown, email unconfirmed, or locked out after wrong passwords).
    /// </summary>
    Task<bool> SignInOnSharedDeviceAsync(Guid userId, Guid deviceId, CancellationToken cancellationToken = default);
}
