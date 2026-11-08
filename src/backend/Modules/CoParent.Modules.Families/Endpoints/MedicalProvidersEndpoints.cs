using System.Text.Json;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record MedicalProvider(Guid Id, string Type, string Name, string? Specialty, string? Practice, string? Phone, string? Address);

internal sealed record MedicalProvidersView(int Revision, IReadOnlyList<MedicalProvider> Providers);

internal sealed record SaveMedicalProvidersRequest(int? Revision, IReadOnlyList<MedicalProvider?>? Providers);

internal sealed record AddMedicalProviderRequest(MedicalProvider? Provider, IReadOnlyList<Guid>? ChildIds);

internal static class MedicalProvidersEndpoints
{
    private const int ProviderLimit = 30;

    public static void Map(IEndpointRouteBuilder family)
    {
        var medical = family.MapGroup("/children/{childId:guid}/essentials/medical").WithTags("Child Essentials");
        medical.MapGet("", GetAsync);
        medical.MapPut("", SaveAsync);
        medical.MapPost("", AddAsync);
        medical.MapGet("/history", HistoryAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, CancellationToken ct)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct))
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(View(await Revisions(db, childId).FirstOrDefaultAsync(ct)));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveMedicalProvidersRequest request, HttpContext http, ITenantContext tenant,
        FamiliesDbContext db, IUnitOfWork work, TimeProvider clock, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Revision is null or < 0 || request.Providers is null or { Count: > ProviderLimit })
        {
            return TypedResults.BadRequest();
        }

        var errors = new Dictionary<string, string[]>();
        var providers = new List<MedicalProvider>();
        var ids = new HashSet<Guid>();
        foreach (var provider in request.Providers)
        {
            if (provider is null || provider.Id == Guid.Empty || !ids.Add(provider.Id))
            {
                errors["providers"] = ["Each provider must have a unique identifier."];
                continue;
            }

            if (Normalize(provider, errors) is { } normalized)
            {
                providers.Add(normalized);
            }
        }

        if (errors.Count != 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var userId = http.User.GetUserId()!.Value;
        return await work.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct) ||
                !await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct))
            {
                return TypedResults.NotFound();
            }

            var current = View(await Revisions(db, childId).FirstOrDefaultAsync(ct));
            if (providers.SequenceEqual(current.Providers))
            {
                return TypedResults.Ok(current);
            }

            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            var now = clock.GetUtcNow();
            AddRevision(db, tenant, userId, childId, current.Revision + 1, providers, now);
            // The other parent's notice (#128): the providers added or changed, and "removed" when one was taken off.
            var changed = providers.Except(current.Providers).Select(item => item.Id.ToString()).ToList();
            var removed = current.Providers.Any(item => providers.All(next => next.Id != item.Id));
            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.Medical, current.Revision + 1,
                removed ? [.. changed, "removed"] : changed, now, ct, rows: changed);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(new MedicalProvidersView(current.Revision + 1, providers));
        }, cancellationToken);
    }

    private static async Task<IResult> AddAsync(
        Guid childId, AddMedicalProviderRequest request, HttpContext http, ITenantContext tenant,
        FamiliesDbContext db, IUnitOfWork work, TimeProvider clock, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Provider is null || request.Provider.Id == Guid.Empty ||
            request.ChildIds is null or { Count: 0 or > ChildEndpoints.MaxChildren })
        {
            return TypedResults.BadRequest();
        }

        var errors = new Dictionary<string, string[]>();
        var provider = Normalize(request.Provider, errors);
        if (provider is null || errors.Count != 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var targets = request.ChildIds.ToHashSet();
        var userId = http.User.GetUserId()!.Value;
        return await work.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct))
            {
                return TypedResults.NotFound();
            }

            var activeIds = await db.Children.Where(child => child.Status == ChildStatus.Active)
                .Select(child => child.Id).ToListAsync(ct);
            if (!activeIds.Contains(childId) || !targets.IsSubsetOf(activeIds))
            {
                return TypedResults.NotFound();
            }

            var pending = new Dictionary<Guid, MedicalProvidersView>();
            var current = View(await Revisions(db, childId).FirstOrDefaultAsync(ct));
            foreach (var target in targets)
            {
                var view = target == childId ? current : View(await Revisions(db, target).FirstOrDefaultAsync(ct));
                var existing = view.Providers.FirstOrDefault(item => item.Id == provider.Id);
                if (existing == provider)
                {
                    continue;
                }

                if (existing is not null || view.Providers.Count >= ProviderLimit)
                {
                    return TypedResults.UnprocessableEntity();
                }

                pending.Add(target, new MedicalProvidersView(view.Revision + 1, [.. view.Providers, provider]));
            }

            var now = clock.GetUtcNow();
            foreach (var (target, view) in pending)
            {
                AddRevision(db, tenant, userId, target, view.Revision, view.Providers, now);
                await EssentialsUpdateEndpoints.RecordAsync(db, tenant, target, EssentialsSections.Medical, view.Revision,
                    [provider.Id.ToString()], now, ct);
            }

            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(pending.GetValueOrDefault(childId) ?? current);
        }, cancellationToken);
    }

    private static MedicalProvider? Normalize(MedicalProvider provider, Dictionary<string, string[]> errors)
    {
        if (provider.Type is not ("Doctor" or "Dentist" or "Optometrist" or "Other"))
        {
            errors["type"] = ["Choose a provider type."];
            return null;
        }

        var name = ChildEssentialsAccess.Normalize(provider.Name, "name", 100, errors);
        var specialty = ChildEssentialsAccess.Normalize(provider.Specialty, "specialty", 100, errors);
        var practice = ChildEssentialsAccess.Normalize(provider.Practice, "practice", 100, errors);
        var phone = ChildEssentialsAccess.Normalize(provider.Phone, "phone", 32, errors);
        var address = ChildEssentialsAccess.Normalize(provider.Address, "address", 200, errors);
        if (phone is not null && (phone.Count(char.IsAsciiDigit) is < 7 or > 15 ||
            phone.Any(c => !char.IsAsciiDigit(c) && c is not ('+' or ' ' or '-' or '(' or ')' or '.'))))
        {
            errors["phone"] = ["Enter a phone number with 7 to 15 digits."];
        }

        if (provider.Type is "Doctor" or "Dentist")
        {
            if (phone is null)
            {
                errors["phone"] = ["Enter a phone number."];
            }

            if (address is null)
            {
                errors["address"] = ["Enter a practice address."];
            }
        }

        if (name is null)
        {
            errors["name"] = ["Enter a provider name."];
            return null;
        }

        return provider with
        {
            Name = name,
            Specialty = provider.Type == "Other" ? specialty : null,
            Practice = practice,
            Phone = phone,
            Address = address,
        };
    }

    private static void AddRevision(
        FamiliesDbContext db, ITenantContext tenant, Guid userId, Guid childId,
        int revision, IReadOnlyList<MedicalProvider> providers, DateTimeOffset now) =>
        db.MedicalProvidersRevisions.Add(new MedicalProvidersRevision
        {
            FamilyId = tenant.FamilyId,
            ChildProfileId = childId,
            Revision = revision,
            EditedByUserId = userId,
            EditedAt = now,
            ProvidersJson = JsonSerializer.Serialize(providers),
        });

    private static Task<IResult> HistoryAsync(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken ct) =>
        EssentialsHistory.PageAsync(childId, beforeRevision, http, tenant, db, directory, Revisions(db, childId), Providers, ct);

    private static MedicalProvidersView View(MedicalProvidersRevision? row) =>
        new(row?.Revision ?? 0, Providers(row));

    private static IReadOnlyList<MedicalProvider> Providers(MedicalProvidersRevision? row) =>
        row is null ? [] : JsonSerializer.Deserialize<MedicalProvider[]>(row.ProvidersJson) ?? [];

    private static IQueryable<MedicalProvidersRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.MedicalProvidersRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId)
            .OrderByDescending(row => row.Revision);
}
