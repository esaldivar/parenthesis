using System.Security.Claims;

namespace CoParent.SharedKernel.Security;

/// <summary>
/// A child's session (ADR-0006): started with a PIN on a registered device, carried in the same secure cookie as a
/// parent's, but with no user id. It names the child, their family and the device instead.
/// </summary>
public static class ChildSessionClaims
{
    public const string AuthenticationType = "ChildPin";
    public const string ChildId = "parenthesis:child";
    public const string FamilyId = "parenthesis:family";
    public const string DeviceId = "parenthesis:device";
    public const string FirstName = "parenthesis:child_name";
}

public sealed record ChildSession(Guid ChildId, Guid FamilyId, Guid DeviceId, string FirstName);

public static class ChildSessionPrincipal
{
    public static ClaimsPrincipal Create(ChildSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        return new ClaimsPrincipal(new ClaimsIdentity(
            [
                new Claim(ChildSessionClaims.ChildId, session.ChildId.ToString()),
                new Claim(ChildSessionClaims.FamilyId, session.FamilyId.ToString()),
                new Claim(ChildSessionClaims.DeviceId, session.DeviceId.ToString()),
                new Claim(ChildSessionClaims.FirstName, session.FirstName),
            ],
            ChildSessionClaims.AuthenticationType));
    }

    /// <summary>The child session this principal carries, or null for parents and anonymous callers.</summary>
    public static ChildSession? GetChildSession(this ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);
        return Guid.TryParse(principal.FindFirst(ChildSessionClaims.ChildId)?.Value, out var child)
            && Guid.TryParse(principal.FindFirst(ChildSessionClaims.FamilyId)?.Value, out var family)
            && Guid.TryParse(principal.FindFirst(ChildSessionClaims.DeviceId)?.Value, out var device)
                ? new ChildSession(child, family, device, principal.FindFirst(ChildSessionClaims.FirstName)?.Value ?? "")
                : null;
    }
}

/// <summary>
/// Endpoint metadata: this endpoint is safe for a child session. Every other endpoint that requires sign-in refuses
/// child sessions, so new parent features are never exposed to children by accident.
/// </summary>
public sealed class ChildSessionAllowed;

/// <summary>Re-checked on every request a child session makes, so disabling access or removing a device is immediate.</summary>
public interface IChildSessionValidator
{
    Task<bool> IsValidAsync(ChildSession session, CancellationToken cancellationToken = default);
}
