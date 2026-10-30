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

/// <param name="Name">What the device is called in the device list, like "Kitchen iPad".</param>
/// <param name="Pin">The parent's new six-digit PIN, required when they don't have one yet; ignored otherwise.</param>
internal sealed record SetUpSharedDeviceRequest(string? Name, string? Pin);

/// <summary>A device in the family's list. <c>IsThisDevice</c>: it's the browser asking, so Settings can offer "Stop sharing".</summary>
internal sealed record DeviceView(
    Guid Id,
    string Name,
    DeviceKind Kind,
    Guid? ChildProfileId,
    DateTimeOffset CreatedAt,
    DateTimeOffset LastSeenAt,
    DateTimeOffset? ExpiresAt,
    bool IsThisDevice = false);

internal sealed record SetPinRequest(string? Pin);

/// <summary>
/// One picker tile. <c>CanSignIn</c>: a child has a PIN, or a parent has a parent PIN (otherwise they use their
/// password). <c>Locked</c>: the PIN needs a parent to reset it. <c>PausedUntil</c>: set while three wrong tries pause it.
/// </summary>
/// <summary>A picker tile. <c>PhotoUrl</c> is that person's own photo (#388), read with this device's cookie, or null.</summary>
internal sealed record ProfileTile(
    string Kind, Guid Id, string Name, bool CanSignIn, bool Locked, DateTimeOffset? PausedUntil, string? PhotoUrl = null);

/// <summary>The picker. <c>IsYours</c>: the signed-in parent (if any) is the one who set up this shared device.</summary>
internal sealed record DeviceProfiles(string FamilyName, DeviceKind DeviceKind, IReadOnlyList<ProfileTile> Profiles, bool IsYours);

internal sealed record ChildSignInRequest(Guid ChildId, string? Pin);

internal sealed record ChildSessionView(Guid ChildId, string FirstName, Guid FamilyId);

internal sealed record PairingCodeView(string Code, DateTimeOffset ExpiresAt);

internal sealed record PairDeviceRequest(string? Code, string? DeviceName);

internal sealed record PairedDeviceView(Guid ChildId, string ChildFirstName);

/// <summary>
/// Devices, the profile picker, child PINs and lockout (A-08 to A-10, ADR-0006, as changed by #153 and ADR-0007).
/// <list type="bullet">
/// <item>A PIN only works on a usable device registered to its family, so it can't be tried from anywhere else.</item>
/// <item>A shared household device is set up explicitly by a parent and works for a fixed 30 days.</item>
/// <item>Three wrong PINs pause a PIN for ten minutes; three more lock it until a parent resets it.</item>
/// <item>Either authorized parent resets a child's PIN at once; the other parent is told, without the PIN.</item>
/// </list>
/// The parent's own PIN, shared-device setup and switching profiles are in <see cref="SharedDeviceEndpoints"/>.
/// </summary>
internal static class ChildAccessEndpoints
{
    public const string PinRateLimitPolicy = "child-pin";

    public static void Map(IEndpointRouteBuilder api, IEndpointRouteBuilder family)
    {
        var devices = family.MapGroup("/devices").WithTags("Devices");
        devices.MapGet("/", ListDevicesAsync);
        devices.MapDelete("/{deviceId:guid}", RevokeDeviceAsync);

        var children = family.MapGroup("/children/{childId:guid}").WithTags("Children");
        children.MapPut("/pin", SetPinAsync);
        children.MapDelete("/pin", DisableAsync);
        children.MapPost("/pairing-code", CreatePairingCodeAsync);

        var device = api.MapGroup("/device").WithTags("Profile picker").AllowAnonymous();
        device.MapGet("/profiles", ProfilesAsync);
        device.MapPost("/child-session", ChildSignInAsync).RequireRateLimiting(PinRateLimitPolicy);
        device.MapPost("/pair", PairAsync).RequireRateLimiting(PinRateLimitPolicy);

        api.MapGet("/session/child", CurrentChild).WithTags("Profile picker").WithMetadata(new ChildSessionAllowed());
    }

    /// <summary>The family's devices that still work: not revoked and, for shared devices, not past their 30 days.</summary>
    private static async Task<Results<Ok<List<DeviceView>>, ForbidHttpResult>> ListDevicesAsync(
        HttpContext http, ITenantContext tenant, FamiliesDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var now = clock.GetUtcNow();
        var devices = await db.Devices
            .Where(d => d.RevokedAt == null && (d.ExpiresAt == null || d.ExpiresAt > now))
            .OrderBy(d => d.CreatedAt)
            .ToListAsync(cancellationToken);
        var thisDevice = DeviceCookie.Read(http.Request) is { } token ? Device.Hash(token) : null;
        return TypedResults.Ok(devices
            .Select(d => View(d) with { IsThisDevice = thisDevice is not null && d.TokenHash.AsSpan().SequenceEqual(thisDevice) })
            .ToList());
    }

    /// <summary>
    /// Protective and immediate: no approval needed. Every parent and child session on the device ends on its next
    /// request, and its picker is gone until a parent signs in there and sets it up again (#153). Removing the device
    /// you're using is how a parent stops sharing it ("Stop sharing this device" in Settings).
    /// </summary>
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
    /// Setting a child's first PIN enables their sign-in (the child is already approved by both parents). Either
    /// authorized parent can reset it later, at once and without the other's approval (#153): a reset clears any pause
    /// or lock, and the other authorized parent is emailed who reset which child's PIN, never the PIN itself.
    /// </summary>
    private static async Task<Results<NoContent, NotFound, ValidationProblem, ForbidHttpResult>> SetPinAsync(
        Guid childId,
        SetPinRequest request,
        HttpContext http,
        ITenantContext tenant,
        FamiliesDbContext db,
        IPasswordHasher<ChildCredential> hasher,
        IUserDirectory directory,
        PinSafetyEmails emails,
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
            // Recipients are read now (the unit of work's transaction ends with it): only the other parents who are
            // currently active members of this family.
            var others = await db.Memberships
                .Where(m => m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active && m.Id != tenant.MembershipId)
                .Select(m => m.UserId)
                .ToListAsync(cancellationToken);
            var contacts = await ParentContactsAsync(directory, others, cancellationToken);
            var actorName = userId is { } actor
                ? (await directory.GetDisplayNamesAsync([actor], cancellationToken)).GetValueOrDefault(actor, "A parent")
                : "A parent";

            await unitOfWork.ExecuteAsync(async ct =>
            {
                existing.Reset(hasher.HashPassword(existing, pin), now);
                existing.PendingPinHash = null; // An older change still waiting for approval no longer applies.
                await db.SaveChangesAsync(ct);
                await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "child.pin_reset", "child", childId), ct);
            }, cancellationToken);

            await emails.SendChildPinResetAsync(contacts, actorName, child.FirstName, cancellationToken);
            return TypedResults.NoContent();
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

    /// <summary>
    /// "Who's using Parenthesis?" for this usable device: names only, no other family data. A shared device shows only
    /// the parent who set it up (never the other parent) and the family's approved children; a paired tablet shows only
    /// its child. Pending, rejected and archived children never appear. A revoked or expired device has no picker.
    /// </summary>
    private static async Task<Results<Ok<DeviceProfiles>, NotFound>> ProfilesAsync(
        HttpContext http, FamiliesDbContext db, IUserDirectory directory, TimeProvider clock, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        if (await SharedDevices.FindByCookieAsync(http, db, now, cancellationToken) is not { } device)
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

        var owner = device.Kind == DeviceKind.Household ? await SharedDevices.OwnerAsync(db, device, null, cancellationToken) : null;

        // Each tile shows that person's own photo (#388): never a parent's personal photo for a child.
        var subjects = childIds.Append(owner?.Id ?? Guid.Empty).ToList();
        var photos = await db.ProfilePhotos.IgnoreQueryFilters(filter)
            .Where(p => p.FamilyId == device.FamilyId && p.ChooserId == p.SubjectId && subjects.Contains(p.SubjectId))
            .Select(p => new { p.Id, p.SubjectId, p.ChooserKind })
            .ToListAsync(cancellationToken);
        string? PhotoOf(Guid subject, PhotoChooser kind) =>
            photos.FirstOrDefault(p => p.SubjectId == subject && p.ChooserKind == kind) is { } photo ? PhotoEndpoints.DeviceUrl(photo.Id) : null;

        var tiles = new List<ProfileTile>();
        var isYours = false;
        if (owner is not null)
        {
            isYours = http.User.GetChildSession() is null && http.User.GetUserId() == owner.UserId;
            var names = await directory.GetDisplayNamesAsync([owner.UserId], cancellationToken);
            var pin = await db.ParentCredentials.IgnoreQueryFilters(filter)
                .SingleOrDefaultAsync(c => c.MembershipId == owner.Id, cancellationToken);
            tiles.Add(Tile("parent", owner.Id, names.GetValueOrDefault(owner.UserId, "Parent"), pin, now) with
            {
                PhotoUrl = PhotoOf(owner.Id, PhotoChooser.Parent),
            });
        }

        tiles.AddRange(children.Select(c => Tile("child", c.Id, c.FirstName, credentials.GetValueOrDefault(c.Id), now) with
        {
            PhotoUrl = PhotoOf(c.Id, PhotoChooser.Child),
        }));
        return TypedResults.Ok(new DeviceProfiles(familyName, device.Kind, tiles, isYours));
    }

    private static ProfileTile Tile(string kind, Guid id, string name, PinCredential? credential, DateTimeOffset now) => new(
        kind,
        id,
        name,
        CanSignIn: credential is not null,
        Locked: credential?.IsLocked ?? false,
        PausedUntil: credential?.StateAt(now) == PinState.Paused ? credential.PausedUntil : null);

    /// <summary>
    /// A child signs in with their PIN, on a usable registered device only. Success replaces whatever session this
    /// browser had, a parent's included: getting back to a parent profile takes that parent's own PIN or password.
    /// Three wrong PINs pause the child's PIN for ten minutes with no email; three more lock it until a parent resets it
    /// and email every authorized parent.
    /// </summary>
    private static async Task<Results<NoContent, ValidationProblem, ProblemHttpResult>> ChildSignInAsync(
        ChildSignInRequest request,
        HttpContext http,
        FamiliesDbContext db,
        TenantContext tenant,
        IPasswordHasher<ChildCredential> hasher,
        IUserDirectory directory,
        PinSafetyEmails emails,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var notHere = TypedResults.Problem(
            title: "This profile can't sign in on this device.",
            detail: "Ask a parent to set it up.",
            statusCode: StatusCodes.Status403Forbidden);
        if (await SharedDevices.FindByCookieAsync(http, db, now, cancellationToken) is not { } device
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

        switch (credential.StateAt(now))
        {
            case PinState.ResetRequired:
                return PinProblems.ChildLocked(child.FirstName, parentsNotified: null);
            case PinState.Paused:
                return PinProblems.ChildPaused(child.FirstName, credential.PausedUntil!.Value);
        }

        // Malformed input never reaches the PIN check, so it doesn't count as a try.
        var pin = request.Pin ?? "";
        if (!PinProblems.ChildPinFormat(pin))
        {
            return PinProblems.Malformed("Your PIN is 4 to 6 numbers.");
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

        // Read before the unit of work commits (its transaction finishes with it): every currently active parent.
        List<(string Email, string Name)> parents = [];
        if (failure == PinFailure.LockedNow)
        {
            var parentIds = await db.Memberships.IgnoreQueryFilters(filter)
                .Where(m => m.FamilyId == device.FamilyId && m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
                .Select(m => m.UserId)
                .ToListAsync(cancellationToken);
            parents = await ParentContactsAsync(directory, parentIds, cancellationToken);
        }

        try
        {
            await unitOfWork.ExecuteAsync(async ct =>
            {
                // The device acts within its own family for these writes.
                tenant.Resolve(device.FamilyId, child.Id, FamilyRole.Child);
                await db.SaveChangesAsync(ct);
                var action = verified ? "child.signed_in"
                    : failure == PinFailure.PausedNow ? "child.pin_paused"
                    : failure == PinFailure.LockedNow ? "child.locked"
                    : "child.pin_failed";
                await audit.RecordAsync(new AuditEntry(device.FamilyId, null, action, "child", child.Id), ct);
            }, cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return PinProblems.Busy();
        }

        if (verified)
        {
            await http.SignInAsync(
                IdentityConstants.ApplicationScheme,
                ChildSessionPrincipal.Create(new ChildSession(child.Id, device.FamilyId, device.Id, child.FirstName)));
            return TypedResults.NoContent();
        }

        switch (failure)
        {
            case PinFailure.PausedNow:
                return PinProblems.ChildPaused(child.FirstName, credential.PausedUntil!.Value);
            case PinFailure.LockedNow:
                // Each parent is emailed separately, only after the lock is saved.
                var sent = await emails.SendChildLockedAsync(parents, child.FirstName, cancellationToken);
                return PinProblems.ChildLocked(child.FirstName, parentsNotified: sent > 0);
            default:
                return PinProblems.Wrong(credential.TriesLeft);
        }
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
        DeviceCookie.Set(http.Response, token, now.AddDays(400));
        return TypedResults.Ok(new PairedDeviceView(child.Id, child.FirstName));
    }

    private static Results<Ok<ChildSessionView>, UnauthorizedHttpResult> CurrentChild(HttpContext http) =>
        http.User.GetChildSession() is { } child
            ? TypedResults.Ok(new ChildSessionView(child.ChildId, child.FirstName, child.FamilyId))
            : TypedResults.Unauthorized();

    /// <summary>Email and display name for each user, skipping accounts that no longer exist.</summary>
    internal static async Task<List<(string Email, string Name)>> ParentContactsAsync(
        IUserDirectory directory, IEnumerable<Guid> userIds, CancellationToken cancellationToken)
    {
        var contacts = new List<(string, string)>();
        foreach (var id in userIds)
        {
            if (await directory.FindByIdAsync(id, cancellationToken) is { } parent)
            {
                contacts.Add((parent.Email, parent.DisplayName));
            }
        }

        return contacts;
    }

    internal static DeviceView View(Device d) => new(d.Id, d.Name, d.Kind, d.ChildProfileId, d.CreatedAt, d.LastSeenAt, d.ExpiresAt);
}
