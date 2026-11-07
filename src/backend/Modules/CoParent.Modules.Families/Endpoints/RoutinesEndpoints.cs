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

internal sealed record RoutinesValues(string? Bedtime, string? Naps)
{
    public static RoutinesValues From(RoutinesRevision? row) =>
        new(row?.Bedtime, row?.Naps);
}

internal sealed record RoutinesView(int Revision, RoutinesValues Values)
{
    public static RoutinesView From(RoutinesRevision? row) => new(row?.Revision ?? 0, RoutinesValues.From(row));
}

internal sealed record SaveRoutinesRequest(int? Revision, RoutinesValues? Values);

internal sealed record RoutinesHistoryEntry(
    int Revision, string EditedBy, DateTimeOffset EditedAt, RoutinesValues Previous, RoutinesValues Current);

internal sealed record RoutinesHistoryPage(IReadOnlyList<RoutinesHistoryEntry> Entries, int? BeforeRevision);

internal static class RoutinesEndpoints
{
    private const int HistoryPageSize = 20;

    public static void Map(IEndpointRouteBuilder family)
    {
        var routines = family.MapGroup("/children/{childId:guid}/essentials/routines").WithTags("Child Essentials");
        routines.MapGet("", GetAsync);
        routines.MapPut("", SaveAsync);
        routines.MapGet("/history", HistoryAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, CancellationToken cancellationToken)
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

        return TypedResults.Ok(RoutinesView.From(await Revisions(db, childId).FirstOrDefaultAsync(cancellationToken)));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveRoutinesRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUnitOfWork unitOfWork, TimeProvider clock, CancellationToken cancellationToken)
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
        var values = new RoutinesValues(
            ChildEssentialsAccess.Normalize(request.Values.Bedtime, "bedtime", RoutinesRevision.TextLimit, errors),
            ChildEssentialsAccess.Normalize(request.Values.Naps, "naps", RoutinesRevision.TextLimit, errors));
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

            var current = RoutinesView.From(await Revisions(db, childId).FirstOrDefaultAsync(ct));
            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            if (values == current.Values)
            {
                return TypedResults.Ok(current);
            }

            var next = new RoutinesRevision
            {
                FamilyId = tenant.FamilyId,
                ChildProfileId = childId,
                Revision = current.Revision + 1,
                EditedByUserId = userId,
                EditedAt = clock.GetUtcNow(),
                Bedtime = values.Bedtime,
                Naps = values.Naps,
            };
            db.RoutinesRevisions.Add(next);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(RoutinesView.From(next));
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
        var entries = visible.Select((row, i) => new RoutinesHistoryEntry(
            row.Revision, names.GetValueOrDefault(row.EditedByUserId, "A parent"), row.EditedAt,
            RoutinesValues.From(i + 1 < rows.Count ? rows[i + 1] : null), RoutinesValues.From(row))).ToList();
        return TypedResults.Ok(new RoutinesHistoryPage(entries, rows.Count > HistoryPageSize ? visible[^1].Revision : null));
    }

    private static IQueryable<RoutinesRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.RoutinesRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId)
            .OrderByDescending(row => row.Revision);
}
