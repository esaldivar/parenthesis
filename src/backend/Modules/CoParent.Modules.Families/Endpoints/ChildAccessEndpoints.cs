using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Approvals.Contracts;
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

internal sealed record RegisterDeviceRequest(string? Name);

internal sealed record DeviceView(Guid Id, string Name, DeviceKind Kind, Guid? ChildProfileId, DateTimeOffset CreatedAt, DateTimeOffset LastSeenAt);

internal sealed record SetPinRequest(string? Pin);

internal sealed record PinChangeProposed(Guid ChangeRequestId);

internal sealed record ProfileTile(string Kind, Guid Id, string Name, bool CanSignIn, bool Locked);

internal sealed record DeviceProfiles(string FamilyName, DeviceKind DeviceKind, IReadOnlyList<ProfileTile> Profiles);

internal sealed record ChildSignInRequest(Guid ChildId, string? Pin);

internal sealed record ChildSessionView(Guid ChildId, string FirstName, Guid FamilyId);

internal sealed record PairingCodeView(string Code, DateTimeOffset ExpiresAt);

internal sealed record PairDeviceRequest(string? Code, string? DeviceName);

internal sealed record PairedDeviceView(Guid ChildId, string ChildFirstName);

/// <summary>
/// Devices, the profile picker, child PINs and lockout (A-08 to A-10, ADR-0006).
/// <list type="bullet">
/// <item>A child's PIN only works on a device registered to their family, so it can't be tried from anywhere else.</item>
/// <item>Three wrong PINs lock the profile and email both parents; either parent can unlock it.</item>
/// <item>A parent tile never uses a PIN: parents sign back in with their full password (/api/auth/login).</item>
/// </list>
/// </summary>
internal static class ChildAccessEndpoints
{
    public const string PinRateLimitPolicy = "child-pin";

    public static void Map(IEndpointRouteBuilder api, IEndpointRouteBuilder family)
    {
        var devices = family.MapGroup("/devices").WithTags("Devices");
        devices.MapPost("/household", RegisterHouseholdAsync);
        devices.MapGet("/", ListDevicesAsync);
        devices.MapDelete("/{deviceId:guid}", RevokeDeviceAsync);

        var children = family.MapGroup("/children/{childId:guid}").WithTags("Children");
        children.MapPut("/pin", SetPinAsync);
        children.MapDelete("/pin", DisableAsync);
        children.MapPost("/unlock", UnlockAsync);
        children.MapPost("/pairing-code", CreatePairingCodeAsync);

        var device = api.MapGroup("/device").WithTags("Profile picker").AllowAnonymous();
        device.MapGet("/profiles", ProfilesAsync);
        device.MapPost("/child-session", ChildSignInAsync).RequireRateLimiting(PinRateLimitPolicy);
        device.MapPost("/pair", PairAsync).RequireRateLimiting(PinRateLimitPolicy);

        api.MapGet("/session/child", CurrentChild).WithTags("Profile picker").WithMetadata(new ChildSessionAllowed());
    }

    /// <summary>Registers this browser as a household device for the family, so it can show the profile picker.</summary>
    private static async Task<Results<Created<DeviceView>, ValidationProblem, ForbidHttpResult>> RegisterHouseholdAsync(
        RegisterDeviceRequest request,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > Device.NameMaxLength)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["name"] = [$"Give this device a name of 1 to {Device.NameMaxLength} characters, like \"Kitchen iPad\"."],
            });
        }

        var now = clock.GetUtcNow();
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
        };

        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.Devices.Add(device);
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "device.registered", "device", device.Id), ct);
        }, cancellationToken);

        DeviceCookie.Set(http.Response, token, now);
        return TypedResults.Created($"/api/families/{tenant.FamilyId}/devices/{device.Id}", View(device));
    }

    private static async Task<Results<Ok<List<DeviceView>>, ForbidHttpResult>> ListDevicesAsync(
        ITenantContext tenant, FamiliesDbContext db, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var devices = await db.Devices.Where(d => d.RevokedAt == null).OrderBy(d => d.CreatedAt).ToListAsync(cancellationToken);
        return TypedResults.Ok(devices.Select(View).ToList());
    }

    /// <summary>Protective and immediate: no approval needed. Any child session on it ends on its next request.</summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> RevokeDeviceAsync(
        Guid deviceId,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var device = await db.Devices.SingleOrDefaultAsync(d => d.Id == deviceId, cancellationToken);
        if (device is null)
        {
            return TypedResults.NotFound();
        }

        await unitOfWork.ExecuteAsync(async ct =>
        {
            device.Revoke(clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "device.revoked", "device", device.Id), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// Setting a child's first PIN enables their sign-in (the child is already approved by both parents). Changing an
    /// existing PIN needs the co-parent's approval (ADR-0006): the new PIN is held, hashed, until they approve, and the
    /// current PIN keeps working meanwhile.
    /// </summary>
    private static async Task<Results<NoContent, Accepted<PinChangeProposed>, NotFound, ValidationProblem, ProblemHttpResult, ForbidHttpResult>> SetPinAsync(
        Guid childId,
        SetPinRequest request,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IPasswordHasher<ChildCredential> hasher,
        IChangeRequests changeRequests,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var child = await db.Children.SingleOrDefaultAsync(c => c.Id == childId, cancellationToken);
        if (child is null || child.Status != ChildStatus.Active)
        {
            return TypedResults.NotFound();
        }

        var pin = request.Pin?.Trim() ?? "";
        if (!ChildCredential.IsAcceptable(pin))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["pin"] = ["Choose 4 to 6 digits that aren't all the same or in a simple run like 1234."],
            });
        }

        var now = clock.GetUtcNow();
        var userId = http.User.GetUserId();
        var existing = await db.ChildCredentials.SingleOrDefaultAsync(c => c.ChildProfileId == childId, cancellationToken);
        if (existing is not null)
        {
            if (existing.PendingPinHash is not null)
            {
                return TypedResults.Problem(
                    title: $"A new PIN for {child.FirstName} is already waiting for approval.",
                    detail: "Your co-parent can approve it, or whoever proposed it can withdraw it, before another change.",
                    statusCode: StatusCodes.Status409Conflict);
            }

            Guid requestId = default;
            await unitOfWork.ExecuteAsync(async ct =>
            {
                existing.PendingPinHash = hasher.HashPassword(existing, pin);
                existing.UpdatedAt = now;
                await db.SaveChangesAsync(ct);
                requestId = await changeRequests.ProposeAsync(
                    new ChangeRequestProposal(
                        ChangeRequestTypes.ChildPinChange, "child", childId, $"Change {child.FirstName}'s PIN", tenant.MembershipId, userId!.Value),
                    ct);
            }, cancellationToken);
            return TypedResults.Accepted((string?)null, new PinChangeProposed(requestId));
        }

        var credential = new ChildCredential { FamilyId = tenant.FamilyId, ChildProfileId = childId, PinHash = "", UpdatedAt = now };
        credential.PinHash = hasher.HashPassword(credential, pin);
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.ChildCredentials.Add(credential);
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "child.access_enabled", "child", childId), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>Disabling a child's sign-in is protective and immediate (decision 8): their sessions end at once.</summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> DisableAsync(
        Guid childId,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var credential = await db.ChildCredentials.SingleOrDefaultAsync(c => c.ChildProfileId == childId, cancellationToken);
        if (credential is null)
        {
            return TypedResults.NotFound();
        }

        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.ChildCredentials.Remove(credential);
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "child.access_disabled", "child", childId), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>"Tap to unlock": either parent, no approval needed, audited.</summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> UnlockAsync(
        Guid childId,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var credential = await db.ChildCredentials.SingleOrDefaultAsync(c => c.ChildProfileId == childId, cancellationToken);
        if (credential is null)
        {
            return TypedResults.NotFound();
        }

        await unitOfWork.ExecuteAsync(async ct =>
        {
            credential.Unlock(clock.GetUtcNow());
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "child.unlocked", "child", childId), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>"Who's using Parenthesis?" for this registered device: names only, no other family data.</summary>
    private static async Task<Results<Ok<DeviceProfiles>, NotFound>> ProfilesAsync(
        HttpContext http, FamiliesDbContext db, IUserDirectory directory, CancellationToken cancellationToken)
    {
        if (await FindDeviceAsync(http, db, cancellationToken) is not { } device)
        {
            return TypedResults.NotFound();
        }

        string[] filter = [TenantContext.QueryFilterName];
        var familyName = await db.Families.IgnoreQueryFilters(filter)
            .Where(f => f.Id == device.FamilyId).Select(f => f.Name).SingleAsync(cancellationToken);
        var children = await db.Children.IgnoreQueryFilters(filter)
            .Where(c => c.FamilyId == device.FamilyId && c.Status == ChildStatus.Active
                && (device.Kind == DeviceKind.Household || c.Id == device.ChildProfileId))
            .OrderBy(c => c.CreatedAt)
            .ToListAsync(cancellationToken);
        var childIds = children.Select(c => c.Id).ToList();
        var credentials = await db.ChildCredentials.IgnoreQueryFilters(filter)
            .Where(c => childIds.Contains(c.ChildProfileId))
            .ToDictionaryAsync(c => c.ChildProfileId, cancellationToken);

        var tiles = new List<ProfileTile>();
        if (device.Kind == DeviceKind.Household)
        {
            var parents = await db.Memberships.IgnoreQueryFilters(filter)
                .Where(m => m.FamilyId == device.FamilyId && m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
                .OrderBy(m => m.JoinedAt)
                .ToListAsync(cancellationToken);
            var names = await directory.GetDisplayNamesAsync(parents.Select(p => p.UserId).ToList(), cancellationToken);
            tiles.AddRange(parents.Select(p => new ProfileTile("parent", p.Id, names.GetValueOrDefault(p.UserId, "Parent"), true, false)));
        }

        tiles.AddRange(children.Select(c => new ProfileTile(
            "child",
            c.Id,
            c.FirstName,
            CanSignIn: credentials.ContainsKey(c.Id),
            Locked: credentials.TryGetValue(c.Id, out var credential) && credential.IsLocked)));
        return TypedResults.Ok(new DeviceProfiles(familyName, device.Kind, tiles));
    }

    /// <summary>
    /// A child signs in with their PIN, on a registered device only. Success replaces whatever session this browser had
    /// (a parent's included): getting back to a parent profile always takes that parent's full password.
    /// </summary>
    private static async Task<Results<NoContent, ProblemHttpResult>> ChildSignInAsync(
        ChildSignInRequest request,
        HttpContext http,
        FamiliesDbContext db,
        TenantContext tenant,
        IPasswordHasher<ChildCredential> hasher,
        IUserDirectory directory,
        ChildSafetyEmails emails,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var notHere = TypedResults.Problem(
            title: "This profile can't sign in on this device.",
            detail: "Ask a parent to set it up.",
            statusCode: StatusCodes.Status403Forbidden);
        if (await FindDeviceAsync(http, db, cancellationToken) is not { } device
            || (device.Kind == DeviceKind.ChildPaired && device.ChildProfileId != request.ChildId))
        {
            return notHere;
        }

        string[] filter = [TenantContext.QueryFilterName];
        var child = await db.Children.IgnoreQueryFilters(filter).SingleOrDefaultAsync(
            c => c.Id == request.ChildId && c.FamilyId == device.FamilyId && c.Status == ChildStatus.Active, cancellationToken);
        var credential = child is null
            ? null
            : await db.ChildCredentials.IgnoreQueryFilters(filter).SingleOrDefaultAsync(c => c.ChildProfileId == child.Id, cancellationToken);
        if (child is null || credential is null)
        {
            return notHere;
        }

        if (credential.IsLocked)
        {
            return Locked(child.FirstName);
        }

        var now = clock.GetUtcNow();
        var pin = request.Pin ?? "";
        var verified = pin.Length is >= 4 and <= 6
            && hasher.VerifyHashedPassword(credential, credential.PinHash, pin) != PasswordVerificationResult.Failed;
        var lockedNow = false;
        List<string> parentEmails = [];
        if (verified)
        {
            credential.RecordSuccess();
            device.LastSeenAt = now;
        }
        else
        {
            lockedNow = credential.RecordFailure(now);
            if (lockedNow)
            {
                // Read before the unit of work commits (its transaction finishes with it).
                var parentIds = await db.Memberships.IgnoreQueryFilters(filter)
                    .Where(m => m.FamilyId == device.FamilyId && m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
                    .Select(m => m.UserId)
                    .ToListAsync(cancellationToken);
                foreach (var id in parentIds)
                {
                    if (await directory.FindByIdAsync(id, cancellationToken) is { } parent)
                    {
                        parentEmails.Add(parent.Email);
                    }
                }
            }
        }

        await unitOfWork.ExecuteAsync(async ct =>
        {
            // The device acts within its own family for these writes.
            tenant.Resolve(device.FamilyId, child.Id, FamilyRole.Child);
            await db.SaveChangesAsync(ct);
            var action = verified ? "child.signed_in" : lockedNow ? "child.locked" : "child.pin_failed";
            await audit.RecordAsync(new AuditEntry(device.FamilyId, null, action, "child", child.Id), ct);
        }, cancellationToken);

        if (!verified)
        {
            if (lockedNow)
            {
                await emails.SendLockedAsync(parentEmails, child.FirstName, device.Name, cancellationToken);
                return Locked(child.FirstName);
            }

            var left = ChildCredential.MaxFailedAttempts - credential.FailedAttempts;
            return TypedResults.Problem(
                title: "That PIN didn't work.",
                detail: left == 1 ? "1 try left." : $"{left} tries left.",
                statusCode: StatusCodes.Status401Unauthorized,
                extensions: new Dictionary<string, object?> { ["triesLeft"] = left });
        }

        await http.SignInAsync(
            IdentityConstants.ApplicationScheme,
            ChildSessionPrincipal.Create(new ChildSession(child.Id, device.FamilyId, device.Id, child.FirstName)));
        return TypedResults.NoContent();
    }

    /// <summary>
    /// A one-time code for pairing this child's own tablet (A-11). Valid for 10 minutes and single use; it replaces any
    /// earlier unused code for the same child.
    /// </summary>
    private static async Task<Results<Ok<PairingCodeView>, NotFound, ForbidHttpResult>> CreatePairingCodeAsync(
        Guid childId,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await db.Children.AnyAsync(c => c.Id == childId && c.Status == ChildStatus.Active, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        var now = clock.GetUtcNow();
        var (code, hash) = DevicePairingCode.NewCode();
        var pairing = new DevicePairingCode
        {
            FamilyId = tenant.FamilyId,
            ChildProfileId = childId,
            CodeHash = hash,
            CreatedByMembershipId = tenant.MembershipId,
            CreatedAt = now,
            ExpiresAt = now + DevicePairingCode.Lifetime,
        };

        await unitOfWork.ExecuteAsync(async ct =>
        {
            var earlier = await db.PairingCodes.Where(c => c.ChildProfileId == childId && c.UsedAt == null).ToListAsync(ct);
            earlier.ForEach(c => c.MarkUsed(now));
            db.PairingCodes.Add(pairing);
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, http.User.GetUserId(), "device.pairing_code_created", "child", childId), ct);
        }, cancellationToken);
        return TypedResults.Ok(new PairingCodeView(code, pairing.ExpiresAt));
    }

    /// <summary>
    /// The child's tablet redeems the code and becomes that child's device. Any session on this browser ends: a
    /// child's tablet never keeps a parent signed in.
    /// </summary>
    private static async Task<Results<Ok<PairedDeviceView>, ValidationProblem, ProblemHttpResult>> PairAsync(
        PairDeviceRequest request,
        HttpContext http,
        FamiliesDbContext db,
        TenantContext tenant,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var name = request.DeviceName?.Trim() ?? "";
        if (name.Length is 0 or > Device.NameMaxLength)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["deviceName"] = [$"Give this device a name of 1 to {Device.NameMaxLength} characters, like \"Kai's tablet\"."],
            });
        }

        var invalid = TypedResults.Problem(
            title: "That code didn't work.",
            detail: "Codes work once and only for 10 minutes. Ask a parent for a new one.",
            statusCode: StatusCodes.Status404NotFound);
        if (string.IsNullOrWhiteSpace(request.Code))
        {
            return invalid;
        }

        var now = clock.GetUtcNow();
        var hash = DevicePairingCode.Hash(request.Code);
        string[] filter = [TenantContext.QueryFilterName];
        var pairing = await db.PairingCodes.IgnoreQueryFilters(filter).SingleOrDefaultAsync(c => c.CodeHash == hash, cancellationToken);
        var child = pairing is null
            ? null
            : await db.Children.IgnoreQueryFilters(filter).SingleOrDefaultAsync(
                c => c.Id == pairing.ChildProfileId && c.Status == ChildStatus.Active, cancellationToken);
        if (pairing is null || child is null || !pairing.IsUsable(now))
        {
            return invalid;
        }

        var (token, tokenHash) = Device.NewToken();
        var device = new Device
        {
            FamilyId = pairing.FamilyId,
            Kind = DeviceKind.ChildPaired,
            ChildProfileId = child.Id,
            Name = name,
            TokenHash = tokenHash,
            CreatedByMembershipId = pairing.CreatedByMembershipId,
            CreatedAt = now,
            LastSeenAt = now,
        };

        await unitOfWork.ExecuteAsync(async ct =>
        {
            // The tablet joins this family as the child's device.
            tenant.Resolve(pairing.FamilyId, child.Id, FamilyRole.Child);
            pairing.MarkUsed(now);
            db.Devices.Add(device);
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(pairing.FamilyId, null, "device.paired", "device", device.Id), ct);
        }, cancellationToken);

        await http.SignOutAsync(IdentityConstants.ApplicationScheme);
        DeviceCookie.Set(http.Response, token, now);
        return TypedResults.Ok(new PairedDeviceView(child.Id, child.FirstName));
    }

    private static Results<Ok<ChildSessionView>, UnauthorizedHttpResult> CurrentChild(HttpContext http) =>
        http.User.GetChildSession() is { } child
            ? TypedResults.Ok(new ChildSessionView(child.ChildId, child.FirstName, child.FamilyId))
            : TypedResults.Unauthorized();

    private static ProblemHttpResult Locked(string firstName) => TypedResults.Problem(
        title: $"{firstName}'s profile is locked.",
        detail: "Ask Mom or Dad to unlock it.",
        statusCode: StatusCodes.Status423Locked);

    /// <summary>The active registered device this browser's device cookie belongs to, across families by exact hash.</summary>
    private static async Task<Device?> FindDeviceAsync(HttpContext http, FamiliesDbContext db, CancellationToken cancellationToken)
    {
        if (DeviceCookie.Read(http.Request) is not { } token)
        {
            return null;
        }

        var hash = Device.Hash(token);
        return await db.Devices
            .IgnoreQueryFilters([TenantContext.QueryFilterName])
            .SingleOrDefaultAsync(d => d.TokenHash == hash && d.RevokedAt == null, cancellationToken);
    }

    private static DeviceView View(Device d) => new(d.Id, d.Name, d.Kind, d.ChildProfileId, d.CreatedAt, d.LastSeenAt);
}
