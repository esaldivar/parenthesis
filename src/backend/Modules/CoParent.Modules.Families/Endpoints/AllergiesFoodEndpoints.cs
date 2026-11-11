using System.Globalization;
using System.Net.Mime;
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

internal static class AllergiesFoodEndpoints
{
    public static void Map(IEndpointRouteBuilder family)
    {
        family.MapGet("/child-essentials/allergies/pdf", DownloadPdfAsync).WithTags("Child Essentials");
        var allergiesFood = family.MapGroup("/children/{childId:guid}/essentials/allergies-food").WithTags("Child Essentials");
        allergiesFood.MapGet("", GetAsync);
        allergiesFood.MapPut("", SaveAsync);
        allergiesFood.MapGet("/history", HistoryAsync);
    }

    private static async Task<IResult> DownloadPdfAsync(
        Guid? childId, string? language, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Headers.XContentTypeOptions = "nosniff";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var spanish = string.Equals(language, "es-419", StringComparison.OrdinalIgnoreCase);
        http.Response.Headers.ContentLanguage = spanish ? "es-419" : "en";
        var noKnownAllergies = spanish ? "Sin alergias conocidas" : "No known allergies";
        var noAllergies = spanish ? "No se han registrado alergias" : "No allergies listed";
        var children = await db.Children.AsNoTracking()
            .Where(child => child.Status == ChildStatus.Active && (childId == null || child.Id == childId))
            .OrderBy(child => child.FirstName).ThenBy(child => child.Id)
            .Select(child => new AllergyPdfSection(
                child.FirstName,
                db.AllergiesFoodRevisions.Where(row => row.ChildProfileId == child.Id)
                    .OrderByDescending(row => row.Revision)
                    .Select(row => row.Allergies ?? (row.NoKnownAllergies ? noKnownAllergies : noAllergies))
                    .FirstOrDefault() ?? noAllergies))
            .ToListAsync(cancellationToken);
        if (children.Count == 0)
        {
            return TypedResults.NotFound();
        }

        var generatedAt = clock.GetUtcNow();
        var date = generatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        // The backend runs with invariant globalization; named cultures are unavailable.
        var displayDate = generatedAt.ToString(spanish ? "dd/MM/yyyy" : "yyyy-MM-dd", CultureInfo.InvariantCulture);
        return TypedResults.File(AllergyPdf.Render(children, generatedAt, displayDate, spanish), MediaTypeNames.Application.Pdf, $"allergies-{date}.pdf");
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

    private static Task<IResult> HistoryAsync(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken cancellationToken) =>
        EssentialsHistory.PageAsync(childId, beforeRevision, http, tenant, db, directory, Revisions(db, childId), AllergiesFoodValues.From, cancellationToken);

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
