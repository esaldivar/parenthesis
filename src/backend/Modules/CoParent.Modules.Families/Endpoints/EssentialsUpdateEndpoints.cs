using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

/// <summary>A child's section with something this parent hasn't looked at: its dot, and the rows still highlighted.</summary>
internal sealed record EssentialsSectionUpdates(Guid ChildId, string Section, bool Unopened, IReadOnlyList<string> Rows);

/// <summary>This parent's Child Essentials indicators: the navigation dot, then each section's dot and rows.</summary>
internal sealed record EssentialsUpdatesView(bool NewUpdates, IReadOnlyList<EssentialsSectionUpdates> Sections);

/// <summary>One banner: a child's section, and every field changed there since the parent last opened the page.</summary>
internal sealed record EssentialsBanner(Guid ChildId, string Section, IReadOnlyList<string> Fields);

internal sealed record EssentialsSectionRequest(Guid ChildId, string? Section);

internal sealed record EssentialsRowsRequest(Guid ChildId, string? Section, IReadOnlyList<string>? Fields);

/// <summary>
/// In-page indicators for shared Child Essentials updates (#128, docs/design/child-essentials-handoff.md). When one
/// parent saves a shared section, each other active parent gets one notice for that revision, in the same transaction
/// as the save; a no-op, rejected or conflicting save makes none. Opening the page clears the navigation dot and returns
/// the banners once; opening a section clears its dot; a row's highlight clears when it has been on screen. Notices hold
/// only identifiers, never values. Separate from Chat and Notifications, and no email.
/// </summary>
internal static class EssentialsUpdateEndpoints
{
    /// <summary>Most rows any section has; a longer request is not a real one.</summary>
    private const int MaxRows = 16;

    public static void Map(IEndpointRouteBuilder family)
    {
        var updates = family.MapGroup("/essentials/updates").WithTags("Child Essentials");
        updates.MapGet("", GetAsync);
        updates.MapPost("/opened", OpenedAsync);
        updates.MapPost("/sections", SectionOpenedAsync);
        updates.MapPost("/rows", RowsSeenAsync);
    }

    /// <summary>
    /// Records a notice for every other active parent, when <paramref name="fields"/> isn't empty. Call inside the save's
    /// transaction, after the family row is locked, and before SaveChanges. <paramref name="rows"/> are the changed rows
    /// still on the page to highlight (all of <paramref name="fields"/> unless given; a removed entry has no row).
    /// </summary>
    public static async Task RecordAsync(
        FamiliesDbContext db, ITenantContext tenant, Guid childId, string section, int revision,
        IReadOnlyList<string> fields, DateTimeOffset now, CancellationToken ct, IReadOnlyList<string>? rows = null)
    {
        if (fields.Count == 0)
        {
            return;
        }

        var recipients = await db.Memberships
            .Where(m => m.Id != tenant.MembershipId && m.Role == FamilyRole.Parent && m.Status == MembershipStatus.Active)
            .Select(m => m.Id)
            .ToListAsync(ct);
        foreach (var recipient in recipients)
        {
            db.EssentialsUpdates.Add(new EssentialsUpdate
            {
                FamilyId = tenant.FamilyId,
                RecipientMembershipId = recipient,
                ChildProfileId = childId,
                Section = section,
                Revision = revision,
                Fields = [.. fields],
                PendingFields = [.. rows ?? fields],
                CreatedAt = now,
            });
        }
    }

    /// <summary>A row that's gone from the page (a removed entry) can't come on screen, so it stops being highlighted.</summary>
    public static async Task ForgetRowAsync(FamiliesDbContext db, Guid childId, string section, string row, CancellationToken ct)
    {
        var updates = await db.EssentialsUpdates
            .Where(u => u.ChildProfileId == childId && u.Section == section && u.PendingFields.Contains(row))
            .ToListAsync(ct);
        foreach (var update in updates)
        {
            update.PendingFields = update.PendingFields.Where(f => f != row).ToList();
        }
    }

    /// <summary>The names of the fields whose values differ.</summary>
    public static IReadOnlyList<string> Changed(params (string Field, object? Before, object? After)[] fields) =>
        fields.Where(f => !Equals(f.Before, f.After)).Select(f => f.Field).ToList();

    private static async Task<Results<Ok<EssentialsUpdatesView>, ForbidHttpResult>> GetAsync(
        HttpContext http, ITenantContext tenant, FamiliesDbContext db, CancellationToken ct)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var rows = await Mine(db, tenant)
            .Where(u => u.NavSeenAt == null || u.SectionSeenAt == null || u.PendingFields.Count > 0)
            .OrderBy(u => u.CreatedAt)
            .Select(u => new { u.ChildProfileId, u.Section, u.NavSeenAt, u.SectionSeenAt, u.PendingFields })
            .ToListAsync(ct);
        var sections = rows
            .GroupBy(u => (u.ChildProfileId, u.Section))
            .Select(g => new EssentialsSectionUpdates(
                g.Key.ChildProfileId,
                g.Key.Section,
                g.Any(u => u.SectionSeenAt == null),
                g.SelectMany(u => u.PendingFields).Distinct(StringComparer.Ordinal).ToList()))
            .Where(s => s.Unopened || s.Rows.Count > 0)
            .ToList();
        return TypedResults.Ok(new EssentialsUpdatesView(rows.Any(u => u.NavSeenAt == null), sections));
    }

    /// <summary>The parent opened Child Essentials: clears the navigation dot and returns its banners, once.</summary>
    private static async Task<Results<Ok<List<EssentialsBanner>>, ForbidHttpResult>> OpenedAsync(
        HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUnitOfWork unitOfWork, TimeProvider clock,
        CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var banners = await unitOfWork.ExecuteAsync(async ct =>
        {
            // Locked, so two tabs opening at once can't both show the same banners.
            var unseen = await db.EssentialsUpdates
                .FromSql($"SELECT * FROM families.essentials_updates WHERE recipient_membership_id = {tenant.MembershipId} AND nav_seen_at IS NULL FOR UPDATE")
                .ToListAsync(ct);
            var activeChildren = await ActiveChildIds(db, ct);
            var now = clock.GetUtcNow();
            foreach (var update in unseen)
            {
                update.NavSeenAt = now;
            }

            await db.SaveChangesAsync(ct);
            return unseen
                .Where(u => activeChildren.Contains(u.ChildProfileId))
                .OrderBy(u => u.CreatedAt)
                .GroupBy(u => (u.ChildProfileId, u.Section))
                .Select(g => new EssentialsBanner(
                    g.Key.ChildProfileId, g.Key.Section, g.SelectMany(u => u.Fields).Distinct(StringComparer.Ordinal).ToList()))
                .ToList();
        }, cancellationToken);
        return TypedResults.Ok(banners);
    }

    /// <summary>The parent opened a child's section: clears its dot. Its rows stay highlighted until seen.</summary>
    private static async Task<Results<NoContent, ValidationProblem, ForbidHttpResult>> SectionOpenedAsync(
        EssentialsSectionRequest request, ITenantContext tenant, FamiliesDbContext db, TimeProvider clock,
        CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!IsSection(request.Section))
        {
            return InvalidSection();
        }

        var now = clock.GetUtcNow();
        await Mine(db, tenant)
            .Where(u => u.ChildProfileId == request.ChildId && u.Section == request.Section && u.SectionSeenAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(u => u.SectionSeenAt, now), ct);
        return TypedResults.NoContent();
    }

    /// <summary>Changed rows the parent has had on screen: their highlight clears.</summary>
    private static async Task<Results<NoContent, ValidationProblem, ForbidHttpResult>> RowsSeenAsync(
        EssentialsRowsRequest request, ITenantContext tenant, FamiliesDbContext db, IUnitOfWork unitOfWork,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!IsSection(request.Section))
        {
            return InvalidSection();
        }

        if (request.Fields is not { Count: > 0 and <= MaxRows } seen || seen.Any(f => f is null || f.Length > 64))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["fields"] = ["Name the rows that were seen."] });
        }

        await unitOfWork.ExecuteAsync(async ct =>
        {
            var updates = await db.EssentialsUpdates
                .Where(u => u.RecipientMembershipId == tenant.MembershipId && u.ChildProfileId == request.ChildId &&
                            u.Section == request.Section && u.PendingFields.Count > 0)
                .ToListAsync(ct);
            foreach (var update in updates)
            {
                update.PendingFields = update.PendingFields.Where(f => !seen.Contains(f)).ToList();
            }

            await db.SaveChangesAsync(ct);
            return true;
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>This parent's notices for the family's active children.</summary>
    private static IQueryable<EssentialsUpdate> Mine(FamiliesDbContext db, ITenantContext tenant) =>
        db.EssentialsUpdates.Where(u => u.RecipientMembershipId == tenant.MembershipId &&
                                        db.Children.Any(c => c.Id == u.ChildProfileId && c.Status == ChildStatus.Active));

    private static async Task<HashSet<Guid>> ActiveChildIds(FamiliesDbContext db, CancellationToken ct) =>
        [.. await db.Children.Where(c => c.Status == ChildStatus.Active).Select(c => c.Id).ToListAsync(ct)];

    private static bool IsSection(string? section) => section is not null && EssentialsSections.All.Contains(section);

    private static ValidationProblem InvalidSection() =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["section"] = ["Choose a Child Essentials section."] });
}
