using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure.Persistence;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

/// <summary>One change in a section's history: who saved it, when, and the values before and after.</summary>
internal sealed record EssentialsHistoryEntry<TValues>(
    int Revision, string EditedBy, DateTimeOffset EditedAt, TValues Previous, TValues Current);

/// <summary>A page of history, newest first; <c>BeforeRevision</c> asks for the next older page, or is null at the end.</summary>
internal sealed record EssentialsHistoryPage<TValues>(IReadOnlyList<EssentialsHistoryEntry<TValues>> Entries, int? BeforeRevision);

/// <summary>The history endpoint every shared section has: parents only, the family's active children, 20 at a time.</summary>
internal static class EssentialsHistory
{
    private const int PageSize = 20;

    /// <summary>
    /// A page of the section's history. <paramref name="revisions"/> are the child's revisions, newest first;
    /// <paramref name="values"/> reads a revision's values, or the empty values before the first one (null).
    /// </summary>
    public static async Task<IResult> PageAsync<TRow, TValues>(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, IQueryable<TRow> revisions, Func<TRow?, TValues> values, CancellationToken ct)
        where TRow : class, IEssentialsRevision
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

        if (beforeRevision is int before)
        {
            revisions = revisions.Where(row => row.Revision < before);
        }

        // The extra row supplies the previous values for the oldest displayed entry.
        var rows = await revisions.Take(PageSize + 1).ToListAsync(ct);
        var visible = rows.Take(PageSize).ToList();
        var names = await directory.GetDisplayNamesAsync(visible.Select(row => row.EditedByUserId).Distinct().ToList(), ct);
        var entries = visible.Select((row, i) => new EssentialsHistoryEntry<TValues>(
            row.Revision, names.GetValueOrDefault(row.EditedByUserId, "A parent"), row.EditedAt,
            values(i + 1 < rows.Count ? rows[i + 1] : null), values(row))).ToList();
        return TypedResults.Ok(new EssentialsHistoryPage<TValues>(entries, rows.Count > PageSize ? visible[^1].Revision : null));
    }
}
