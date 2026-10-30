using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using NodaTime;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record CreateFamilyRequest(string? Name, string? TimeZone);

internal sealed record FamilySummary(Guid Id, string Name, string TimeZone, FamilyRole Role);

/// <summary>A family member. <c>IsYou</c> marks the signed-in user's own membership, so the app knows whose events are whose.</summary>
internal sealed record FamilyMember(Guid MembershipId, string DisplayName, FamilyRole Role, DateTimeOffset JoinedAt, bool IsYou, int? PaletteSlot);

internal sealed record FamilyDetails(Guid Id, string Name, string TimeZone, DateTimeOffset CreatedAt, IReadOnlyList<FamilyMember> Members);

internal static class FamilyEndpoints
{
    public static void Map(IEndpointRouteBuilder api, IEndpointRouteBuilder family)
    {
        api.MapPost("/families", CreateAsync).WithTags("Families");
        api.MapGet("/me/families", ListMineAsync).WithTags("Families");
        family.MapGet("/", GetAsync).WithTags("Families");
    }

    /// <summary>Creates a family with the caller as its first parent. Co-parents join by invitation (FM-03).</summary>
    private static async Task<Results<Created<FamilySummary>, ValidationProblem>> CreateAsync(
        CreateFamilyRequest request,
        HttpContext http,
        FamiliesDbContext db,
        TenantContext tenant,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var name = request.Name?.Trim();
        var timeZone = string.IsNullOrWhiteSpace(request.TimeZone) ? "UTC" : request.TimeZone.Trim();
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrEmpty(name) || name.Length > Family.NameMaxLength)
        {
            errors["name"] = [$"Enter a family name of 1 to {Family.NameMaxLength} characters."];
        }

        if (DateTimeZoneProviders.Tzdb.GetZoneOrNull(timeZone) is null)
        {
            errors["timeZone"] = ["Choose a valid time zone, such as America/Chicago."];
        }

        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var userId = http.User.GetUserId()!.Value;
        var now = clock.GetUtcNow();
        var family = new Family { Name = name!, TimeZone = timeZone, CreatedAt = now };
        var membership = new FamilyMembership { FamilyId = family.Id, UserId = userId, Role = FamilyRole.Parent, JoinedAt = now, PaletteSlot = 0 };

        await unitOfWork.ExecuteAsync(async ct =>
        {
            // The creator is establishing a new tenant, so this request acts in it from here on.
            tenant.Resolve(family.Id, membership.Id, FamilyRole.Parent);
            db.Families.Add(family);
            db.Memberships.Add(membership);
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(family.Id, userId, "family.created", "family", family.Id), ct);
        }, cancellationToken);

        return TypedResults.Created(
            $"/api/families/{family.Id}",
            new FamilySummary(family.Id, family.Name, family.TimeZone, FamilyRole.Parent));
    }

    private static async Task<Ok<List<FamilySummary>>> ListMineAsync(
        HttpContext http, FamiliesDbContext db, CancellationToken cancellationToken)
    {
        var userId = http.User.GetUserId()!.Value;

        // A user's own family list spans tenants by design; it is constrained to that user's active memberships.
        var families = await (
                from m in db.Memberships.IgnoreQueryFilters([TenantContext.QueryFilterName])
                join f in db.Families.IgnoreQueryFilters([TenantContext.QueryFilterName]) on m.FamilyId equals f.Id
                where m.UserId == userId && m.Status == MembershipStatus.Active
                orderby f.Name
                select new FamilySummary(f.Id, f.Name, f.TimeZone, m.Role))
            .ToListAsync(cancellationToken);

        return TypedResults.Ok(families);
    }

    /// <summary>Behind the tenant gate: only members get here, and the query filters scope every read to this family.</summary>
    private static async Task<Ok<FamilyDetails>> GetAsync(
        HttpContext http, FamiliesDbContext db, IUserDirectory directory, CancellationToken cancellationToken)
    {
        var userId = http.User.GetUserId();
        var family = await db.Families.SingleAsync(cancellationToken);
        var memberships = await db.Memberships
            .Where(m => m.Status == MembershipStatus.Active)
            .OrderBy(m => m.JoinedAt)
            .ToListAsync(cancellationToken);
        var names = await directory.GetDisplayNamesAsync(memberships.Select(m => m.UserId).ToList(), cancellationToken);

        var members = memberships
            .Select(m => new FamilyMember(m.Id, names.GetValueOrDefault(m.UserId, "Former parent"), m.Role, m.JoinedAt, m.UserId == userId, m.PaletteSlot))
            .ToList();
        return TypedResults.Ok(new FamilyDetails(family.Id, family.Name, family.TimeZone, family.CreatedAt, members));
    }
}
