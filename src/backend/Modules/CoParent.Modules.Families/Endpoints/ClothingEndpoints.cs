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

internal sealed record ClothingValues(string? TopSize, string? BottomSize, string? ShoeSize, string? FitNotes)
{
    public static ClothingValues From(ClothingRevision? row) =>
        new(row?.TopSize, row?.BottomSize, row?.ShoeSize, row?.FitNotes);
}

internal sealed record ClothingView(int Revision, ClothingValues Values)
{
    public static ClothingView From(ClothingRevision? row) => new(row?.Revision ?? 0, ClothingValues.From(row));
}

internal sealed record SaveClothingRequest(int? Revision, ClothingValues? Values);

internal sealed record ClothingHistoryEntry(
    int Revision, string EditedBy, DateTimeOffset EditedAt, ClothingValues Previous, ClothingValues Current);

internal sealed record ClothingHistoryPage(IReadOnlyList<ClothingHistoryEntry> Entries, int? BeforeRevision);

internal static class ClothingEndpoints
{
    private const int HistoryPageSize = 20;

    public static void Map(IEndpointRouteBuilder family)
    {
        var clothing = family.MapGroup("/children/{childId:guid}/essentials/clothing").WithTags("Child Essentials");
        clothing.MapGet("", GetAsync);
        clothing.MapPut("", SaveAsync);
        clothing.MapGet("/history", HistoryAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await IsActiveChildAsync(db, childId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(ClothingView.From(await Revisions(db, childId).FirstOrDefaultAsync(cancellationToken)));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveClothingRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
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
        var values = new ClothingValues(
            Normalize(request.Values.TopSize, "topSize", ClothingRevision.SizeLimit, errors),
            Normalize(request.Values.BottomSize, "bottomSize", ClothingRevision.SizeLimit, errors),
            Normalize(request.Values.ShoeSize, "shoeSize", ClothingRevision.SizeLimit, errors),
            Normalize(request.Values.FitNotes, "fitNotes", ClothingRevision.NotesLimit, errors));
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var userId = http.User.GetUserId()!.Value;
        return await unitOfWork.ExecuteAsync<IResult>(async ct =>
        {
            // Share the Families lock with invitation acceptance and account deletion. Recheck eligibility and
            // read the latest revision under the lock, including for the first save when no revision exists.
            var locked = await db.Database.SqlQuery<int>(
                $"SELECT 1 AS \"Value\" FROM families.families WHERE id = {tenant.FamilyId} FOR UPDATE").ToListAsync(ct);
            if (locked.Count == 0 || !await db.Memberships.AnyAsync(m =>
                    m.Id == tenant.MembershipId && m.UserId == userId &&
                    m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active, ct) ||
                !await IsActiveChildAsync(db, childId, ct))
            {
                return TypedResults.NotFound();
            }

            var current = ClothingView.From(await Revisions(db, childId).FirstOrDefaultAsync(ct));
            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            if (values == current.Values)
            {
                return TypedResults.Ok(current);
            }

            var next = new ClothingRevision
            {
                FamilyId = tenant.FamilyId,
                ChildProfileId = childId,
                Revision = current.Revision + 1,
                EditedByUserId = userId,
                EditedAt = clock.GetUtcNow(),
                TopSize = values.TopSize,
                BottomSize = values.BottomSize,
                ShoeSize = values.ShoeSize,
                FitNotes = values.FitNotes,
            };
            db.ClothingRevisions.Add(next);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(ClothingView.From(next));
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

        if (!await IsActiveChildAsync(db, childId, cancellationToken))
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
        var entries = visible.Select((row, i) => new ClothingHistoryEntry(
            row.Revision, names.GetValueOrDefault(row.EditedByUserId, "A parent"), row.EditedAt,
            ClothingValues.From(i + 1 < rows.Count ? rows[i + 1] : null), ClothingValues.From(row))).ToList();
        return TypedResults.Ok(new ClothingHistoryPage(entries, rows.Count > HistoryPageSize ? visible[^1].Revision : null));
    }

    private static IQueryable<ClothingRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.ClothingRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId)
            .OrderByDescending(row => row.Revision);

    private static Task<bool> IsActiveChildAsync(FamiliesDbContext db, Guid childId, CancellationToken cancellationToken) =>
        db.Children.AnyAsync(child => child.Id == childId && child.Status == ChildStatus.Active, cancellationToken);

    private static string? Normalize(string? value, string field, int limit, Dictionary<string, string[]> errors)
    {
        value = value?.Trim();
        if (value is null or "")
        {
            return null;
        }

        if (value.Length > limit || value.Contains('\0'))
        {
            errors[field] = [$"Enter valid text up to {limit} characters."];
        }

        return value;
    }
}
