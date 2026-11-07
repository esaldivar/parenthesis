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

internal sealed record AllergiesFoodValues(string? Allergies, string? FoodPreferences, bool NoKnownAllergies)
{
    public static AllergiesFoodValues From(AllergiesFoodRevision? row) =>
        new(row?.Allergies, row?.FoodPreferences, row?.NoKnownAllergies ?? false);
}

internal sealed record AllergiesFoodView(int Revision, AllergiesFoodValues Values, string? RecordedBy = null, DateTimeOffset? RecordedAt = null)
{
    public static AllergiesFoodView From(AllergiesFoodRevision? row) => new(row?.Revision ?? 0, AllergiesFoodValues.From(row));
}

internal sealed record SaveAllergiesFoodRequest(int? Revision, AllergiesFoodValues? Values);

internal sealed record AllergiesFoodHistoryEntry(
    int Revision, string EditedBy, DateTimeOffset EditedAt, AllergiesFoodValues Previous, AllergiesFoodValues Current);

internal sealed record AllergiesFoodHistoryPage(IReadOnlyList<AllergiesFoodHistoryEntry> Entries, int? BeforeRevision);

internal static class AllergiesFoodEndpoints
{
    private const int HistoryPageSize = 20;

    public static void Map(IEndpointRouteBuilder family)
    {
        var allergiesFood = family.MapGroup("/children/{childId:guid}/essentials/allergies-food").WithTags("Child Essentials");
        allergiesFood.MapGet("", GetAsync);
        allergiesFood.MapPut("", SaveAsync);
        allergiesFood.MapGet("/history", HistoryAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUserDirectory directory, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await ChildEssentialsAccess.IsActiveChildAsync(db, childId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(await CurrentAsync(db, childId, directory, cancellationToken));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveAllergiesFoodRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUnitOfWork unitOfWork, TimeProvider clock, IUserDirectory directory, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Revision is null or < 0 || request.Values is null)
        {
            return TypedResults.BadRequest();
        }

        var errors = new Dictionary<string, string[]>();
        var allergies = ChildEssentialsAccess.Normalize(
            request.Values.Allergies, "allergies", AllergiesFoodRevision.TextLimit, errors);
        var values = new AllergiesFoodValues(
            allergies,
            ChildEssentialsAccess.Normalize(request.Values.FoodPreferences, "foodPreferences", AllergiesFoodRevision.TextLimit, errors),
            allergies is null && request.Values.NoKnownAllergies);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var userId = http.User.GetUserId()!.Value;
        return await unitOfWork.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct) ||
                !await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct))
            {
                return TypedResults.NotFound();
            }

            var current = await CurrentAsync(db, childId, directory, ct);
            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            if (values == current.Values)
            {
                return TypedResults.Ok(current);
            }

            var next = new AllergiesFoodRevision
            {
                FamilyId = tenant.FamilyId,
                ChildProfileId = childId,
                Revision = current.Revision + 1,
                EditedByUserId = userId,
                EditedAt = clock.GetUtcNow(),
                NoKnownAllergies = values.NoKnownAllergies,
                Allergies = values.Allergies,
                FoodPreferences = values.FoodPreferences,
            };
            db.AllergiesFoodRevisions.Add(next);
            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.AllergiesFood, next.Revision,
                EssentialsUpdateEndpoints.Changed(
                ("allergies", current.Values.Allergies, values.Allergies),
                ("foodPreferences", current.Values.FoodPreferences, values.FoodPreferences),
                ("noKnownAllergies", current.Values.NoKnownAllergies, values.NoKnownAllergies)),
                next.EditedAt, ct);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(await CurrentAsync(db, childId, directory, ct));
        }, cancellationToken);
    }

    private static async Task<IResult> HistoryAsync(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await ChildEssentialsAccess.IsActiveChildAsync(db, childId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        var revisions = Revisions(db, childId);
        if (beforeRevision is int before)
        {
            revisions = revisions.Where(row => row.Revision < before);
        }

        // The extra row supplies the previous values for the oldest displayed entry.
        var rows = await revisions.Take(HistoryPageSize + 1).ToListAsync(cancellationToken);
        var visible = rows.Take(HistoryPageSize).ToList();
        var names = await directory.GetDisplayNamesAsync(
            visible.Select(row => row.EditedByUserId).Distinct().ToList(), cancellationToken);
        var entries = visible.Select((row, i) => new AllergiesFoodHistoryEntry(
            row.Revision, names.GetValueOrDefault(row.EditedByUserId, "A parent"), row.EditedAt,
            AllergiesFoodValues.From(i + 1 < rows.Count ? rows[i + 1] : null), AllergiesFoodValues.From(row))).ToList();
        return TypedResults.Ok(new AllergiesFoodHistoryPage(entries, rows.Count > HistoryPageSize ? visible[^1].Revision : null));
    }

    private static async Task<AllergiesFoodView> CurrentAsync(
        FamiliesDbContext db, Guid childId, IUserDirectory directory, CancellationToken cancellationToken)
    {
        var revisions = Revisions(db, childId);
        var current = AllergiesFoodView.From(await revisions.FirstOrDefaultAsync(cancellationToken));
        if (!current.Values.NoKnownAllergies)
        {
            return current;
        }

        var previousStatus = await revisions.Where(row => row.Revision < current.Revision && !row.NoKnownAllergies)
            .Select(row => (int?)row.Revision).FirstOrDefaultAsync(cancellationToken) ?? 0;
        var recorded = await revisions.SingleAsync(row => row.Revision == previousStatus + 1, cancellationToken);
        var names = await directory.GetDisplayNamesAsync([recorded.EditedByUserId], cancellationToken);
        return current with
        {
            RecordedBy = names.GetValueOrDefault(recorded.EditedByUserId, "A parent"),
            RecordedAt = recorded.EditedAt,
        };
    }

    private static IQueryable<AllergiesFoodRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.AllergiesFoodRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId)
            .OrderByDescending(row => row.Revision);
}
