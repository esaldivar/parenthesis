using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record ParentSignInRequest(Guid MembershipId, string? Pin);

internal sealed record ParentPinStatus(bool IsSet, bool Locked, DateTimeOffset? PausedUntil);

internal sealed record SetParentPinRequest(string? CurrentPassword, string? Pin);

/// <summary>
/// Shared family devices and the parent's own PIN (#153, ADR-0007).
/// <list type="bullet">
/// <item>A parent explicitly sets up a shared device after signing in with their password; nothing is registered
/// automatically. Setup creates their six-digit parent PIN if they have none and keeps them signed in: no second
/// password prompt.</item>
/// <item>On that device the parent later enters their own profile with their PIN. Only the parent who set up the
/// device can; the other parent signs in with their own email and password.</item>
/// <item>Switching profile ends the current session but keeps the picker. Full sign-out (/api/auth/logout) also
/// removes the device.</item>
/// <item>A parent changes their own PIN after confirming their password, which also clears a pause or lock.</item>
/// </list>
/// </summary>
internal static class SharedDeviceEndpoints
{
    public const string PinChangeRateLimitPolicy = "parent-pin-change";

    private static readonly string[] _filter = [TenantContext.QueryFilterName];

    public static void Map(IEndpointRouteBuilder api, IEndpointRouteBuilder family)
    {
        family.MapPost("/devices/household", SetUpAsync).WithTags("Devices");
        family.MapGet("/parent-pin", ParentPinAsync).WithTags("Devices");
        family.MapPut("/parent-pin", SetParentPinAsync).WithTags("Devices").RequireRateLimiting(PinChangeRateLimitPolicy);

        var device = api.MapGroup("/device").WithTags("Profile picker").AllowAnonymous();
        device.MapPost("/parent-session", ParentSignInAsync).RequireRateLimiting(ChildAccessEndpoints.PinRateLimitPolicy);
        device.MapPost("/switch", (Delegate)SwitchAsync).WithMetadata(new ChildSessionAllowed());
    }

    /// <summary>
    /// "Yes, this is a shared family device." Registers this browser for the signed-in parent's family for a fixed
    /// 30 days, replacing any device this browser held for the family, and binds the parent's current session to it.
    /// </summary>
    private static async Task<Results<Created<DeviceView>, ValidationProblem, ForbidHttpResult>> SetUpAsync(
        SetUpSharedDeviceRequest request,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IPasswordHasher<ParentCredential> hasher,
        IParentSessions sessions,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent || http.User.GetUserId() is not { } userId)
        {
            return TypedResults.Forbid();
        }

        var errors = new Dictionary<string, string[]>();
        var name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > Device.NameMaxLength)
        {
            errors["name"] = [$"Give this device a name of 1 to {Device.NameMaxLength} characters, like \"Kitchen iPad\"."];
        }

        var existingPin = await db.ParentCredentials.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        var pin = request.Pin?.Trim() ?? "";
        if (existingPin is null && !ParentCredential.IsAcceptable(pin))
        {
            errors["pin"] = [ParentPinRule];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var now = clock.GetUtcNow();
        var previous = await SharedDevices.FindByCookieAsync(http, db, now, cancellationToken);
        var (token, hash) = Device.NewToken();
        var device = new Device
        {
            FamilyId = tenant.FamilyId,
            Kind = DeviceKind.Household,
            Name = name,
            TokenHash = hash,
            CreatedByMembershipId = tenant.MembershipId,
            CreatedAt = now,
            LastSeenAt = now,
            ExpiresAt = now + Device.SharedDeviceLifetime,
        };

        await unitOfWork.ExecuteAsync(async ct =>
        {
            if (existingPin is null)
            {
                var credential = new ParentCredential { FamilyId = tenant.FamilyId, MembershipId = tenant.MembershipId, PinHash = "", UpdatedAt = now };
                credential.PinHash = hasher.HashPassword(credential, pin);
                db.ParentCredentials.Add(credential);
            }

            // One device cookie per browser: the one it held for this family stops working.
            if (previous is not null && previous.FamilyId == tenant.FamilyId)
            {
                previous.Revoke(now);
            }

            db.Devices.Add(device);
            await db.SaveChangesAsync(ct);
            if (existingPin is null)
            {
                await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "parent.pin_set", "membership", tenant.MembershipId), ct);
            }

            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "device.shared_setup", "device", device.Id), ct);
        }, cancellationToken);

        DeviceCookie.Set(http.Response, token, device.ExpiresAt!.Value);
        await sessions.SignInOnSharedDeviceAsync(userId, device.Id, cancellationToken);
        return TypedResults.Created($"/api/families/{tenant.FamilyId}/devices/{device.Id}", ChildAccessEndpoints.View(device));
    }

    /// <summary>The parent's own PIN on this shared device. Three wrong tries pause it and email that parent only.</summary>
    private static async Task<Results<NoContent, ValidationProblem, ProblemHttpResult>> ParentSignInAsync(
        ParentSignInRequest request,
        HttpContext http,
        FamiliesDbContext db,
        TenantContext tenant,
        IPasswordHasher<ParentCredential> hasher,
        IUserDirectory directory,
        IParentSessions sessions,
        PinSafetyEmails emails,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var notHere = TypedResults.Problem(
            title: "This profile can't sign in on this device.",
            detail: "Sign in with your email and password.",
            statusCode: StatusCodes.Status403Forbidden);
        if (await SharedDevices.FindByCookieAsync(http, db, now, cancellationToken) is not { Kind: DeviceKind.Household } device
            || await SharedDevices.OwnerAsync(db, device, null, cancellationToken) is not { } owner
            || owner.Id != request.MembershipId)
        {
            return notHere;
        }

        var credential = await db.ParentCredentials.IgnoreQueryFilters(_filter)
            .SingleOrDefaultAsync(c => c.MembershipId == owner.Id && c.FamilyId == device.FamilyId, cancellationToken);
        if (credential is null)
        {
            return TypedResults.Problem(
                title: "You don't have a parent PIN yet.",
                detail: "Sign in with your email and password. You can choose a PIN in Settings.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?> { ["state"] = "no-pin" });
        }

        switch (credential.StateAt(now))
        {
            case PinState.ResetRequired:
                return PinProblems.ParentLocked(notified: null);
            case PinState.Paused:
                return PinProblems.ParentPaused(credential.PausedUntil!.Value, notified: null);
        }

        var pin = request.Pin ?? "";
        if (!PinProblems.ParentPinFormat(pin))
        {
            return PinProblems.Malformed("Your parent PIN is 6 numbers.");
        }

        var verified = hasher.VerifyHashedPassword(credential, credential.PinHash, pin) != PasswordVerificationResult.Failed;
        var failure = PinFailure.TryAgain;
        if (verified)
        {
            credential.RecordSuccess();
            device.LastSeenAt = now;
        }
        else
        {
            failure = credential.RecordFailure(now);
        }

        // Only the affected parent is emailed, at their registered address. Read before the unit of work commits (its
        // transaction finishes with it).
        DirectoryUser? parent = null;
        var timeZone = "UTC";
        if (failure is PinFailure.PausedNow or PinFailure.LockedNow)
        {
            parent = await directory.FindByIdAsync(owner.UserId, cancellationToken);
            timeZone = await db.Families.IgnoreQueryFilters(_filter)
                .Where(f => f.Id == device.FamilyId).Select(f => f.TimeZone).SingleAsync(cancellationToken);
        }

        try
        {
            await unitOfWork.ExecuteAsync(async ct =>
            {
                tenant.Resolve(device.FamilyId, owner.Id, FamilyRole.Parent);
                await db.SaveChangesAsync(ct);
                var action = verified ? "parent.pin_signed_in"
                    : failure == PinFailure.PausedNow ? "parent.pin_paused"
                    : failure == PinFailure.LockedNow ? "parent.pin_locked"
                    : "parent.pin_failed";
                await audit.RecordAsync(new AuditEntry(device.FamilyId, null, action, "membership", owner.Id), ct);
            }, cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return PinProblems.Busy();
        }

        if (verified)
        {
            // The account itself must still be able to sign in (confirmed, not locked out after wrong passwords).
            return await sessions.SignInOnSharedDeviceAsync(owner.UserId, device.Id, cancellationToken)
                ? TypedResults.NoContent()
                : notHere;
        }

        if (failure == PinFailure.TryAgain)
        {
            return PinProblems.Wrong(credential.TriesLeft);
        }

        if (failure == PinFailure.PausedNow)
        {
            var sent = parent is not null
                && await emails.SendParentPausedAsync(parent.Email, parent.DisplayName, credential.PausedUntil!.Value, timeZone, cancellationToken);
            return PinProblems.ParentPaused(credential.PausedUntil!.Value, sent);
        }

        var lockSent = parent is not null && await emails.SendParentLockedAsync(parent.Email, parent.DisplayName, cancellationToken);
        return PinProblems.ParentLocked(lockSent);
    }

    /// <summary>
    /// Switch profile: ends whoever is signed in on this browser, parent or child, and keeps the shared device's picker.
    /// Getting back into a parent profile takes that parent's PIN or password again.
    /// </summary>
    private static async Task<NoContent> SwitchAsync(HttpContext http)
    {
        await http.SignOutAsync(IdentityConstants.ApplicationScheme);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<ParentPinStatus>, ForbidHttpResult>> ParentPinAsync(
        ITenantContext tenant, FamiliesDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var credential = await db.ParentCredentials.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        var now = clock.GetUtcNow();
        return TypedResults.Ok(new ParentPinStatus(
            credential is not null,
            credential?.IsLocked ?? false,
            credential?.StateAt(now) == PinState.Paused ? credential.PausedUntil : null));
    }

    /// <summary>
    /// A parent chooses or changes their own six-digit PIN after confirming their account password. This is also how a
    /// paused or locked parent PIN is reset: password sign-in first, then a new PIN here.
    /// </summary>
    private static async Task<Results<NoContent, ValidationProblem, ForbidHttpResult>> SetParentPinAsync(
        SetParentPinRequest request,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IAccountRemoval accounts,
        IPasswordHasher<ParentCredential> hasher,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent || http.User.GetUserId() is not { } userId)
        {
            return TypedResults.Forbid();
        }

        var pin = request.Pin?.Trim() ?? "";
        if (!ParentCredential.IsAcceptable(pin))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["pin"] = [ParentPinRule] });
        }

        // Wrong passwords count toward the normal sign-in lockout, so this can't be used to guess the password.
        if (string.IsNullOrEmpty(request.CurrentPassword)
            || !await accounts.CheckPasswordAsync(userId, request.CurrentPassword, cancellationToken))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["currentPassword"] = ["That password isn't right."],
            });
        }

        var now = clock.GetUtcNow();
        var credential = await db.ParentCredentials.SingleOrDefaultAsync(c => c.MembershipId == tenant.MembershipId, cancellationToken);
        await unitOfWork.ExecuteAsync(async ct =>
        {
            if (credential is null)
            {
                credential = new ParentCredential { FamilyId = tenant.FamilyId, MembershipId = tenant.MembershipId, PinHash = "", UpdatedAt = now };
                credential.Reset(hasher.HashPassword(credential, pin), now);
                db.ParentCredentials.Add(credential);
            }
            else
            {
                credential.Reset(hasher.HashPassword(credential, pin), now);
            }

            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "parent.pin_set", "membership", tenant.MembershipId), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    private const string ParentPinRule = "Choose 6 digits that aren't all the same or in a simple run like 123456.";
}
