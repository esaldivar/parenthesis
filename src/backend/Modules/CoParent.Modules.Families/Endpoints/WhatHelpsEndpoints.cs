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

internal sealed record WhatHelpsValues(string? ComfortItems, string? CalmingStrategies)
{
    public static WhatHelpsValues From(WhatHelpsRevision? row) =>
        new(row?.ComfortItems, row?.CalmingStrategies);
}

internal sealed record WhatHelpsView(int Revision, WhatHelpsValues Values)
{
    public static WhatHelpsView From(WhatHelpsRevision? row) => new(row?.Revision ?? 0, WhatHelpsValues.From(row));
}

internal sealed record SaveWhatHelpsRequest(int? Revision, WhatHelpsValues? Values);

internal sealed record WhatHelpsHistoryEntry(
    int Revision, string EditedBy, DateTimeOffset EditedAt, WhatHelpsValues Previous, WhatHelpsValues Current);

internal sealed record WhatHelpsHistoryPage(IReadOnlyList<WhatHelpsHistoryEntry> Entries, int? BeforeRevision);

internal static class WhatHelpsEndpoints
{
    private const int HistoryPageSize = 20;

    public static void Map(IEndpointRouteBuilder family)
    {
        var whatHelps = family.MapGroup("/children/{childId:guid}/essentials/what-helps").WithTags("Child Essentials");
        whatHelps.MapGet("", GetAsync);
        whatHelps.MapPut("", SaveAsync);
        whatHelps.MapGet("/history", HistoryAsync);
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

        return TypedResults.Ok(WhatHelpsView.From(await Revisions(db, childId).FirstOrDefaultAsync(cancellationToken)));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveWhatHelpsRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
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
        var values = new WhatHelpsValues(
            ChildEssentialsAccess.Normalize(request.Values.ComfortItems, "comfortItems", WhatHelpsRevision.TextLimit, errors),
            ChildEssentialsAccess.Normalize(request.Values.CalmingStrategies, "calmingStrategies", WhatHelpsRevision.TextLimit, errors));
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

            var current = WhatHelpsView.From(await Revisions(db, childId).FirstOrDefaultAsync(ct));
            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            if (values == current.Values)
            {
                return TypedResults.Ok(current);
            }

            var next = new WhatHelpsRevision
            {
                FamilyId = tenant.FamilyId,
                ChildProfileId = childId,
                Revision = current.Revision + 1,
                EditedByUserId = userId,
                EditedAt = clock.GetUtcNow(),
                ComfortItems = values.ComfortItems,
                CalmingStrategies = values.CalmingStrategies,
            };
            db.WhatHelpsRevisions.Add(next);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(WhatHelpsView.From(next));
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
        var entries = visible.Select((row, i) => new WhatHelpsHistoryEntry(
            row.Revision, names.GetValueOrDefault(row.EditedByUserId, "A parent"), row.EditedAt,
            WhatHelpsValues.From(i + 1 < rows.Count ? rows[i + 1] : null), WhatHelpsValues.From(row))).ToList();
        return TypedResults.Ok(new WhatHelpsHistoryPage(entries, rows.Count > HistoryPageSize ? visible[^1].Revision : null));
    }

    private static IQueryable<WhatHelpsRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.WhatHelpsRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId)
            .OrderByDescending(row => row.Revision);
}
