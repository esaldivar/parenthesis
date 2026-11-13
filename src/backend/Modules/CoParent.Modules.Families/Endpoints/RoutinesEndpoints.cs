using System.Text.Json;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure.Persistence;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

/// <summary>One routine a parent added (#498): a title, such as "Brushing teeth", and optional details.</summary>
internal sealed record RoutineEntry(Guid Id, string? Title, string? Details);

/// <summary>
/// A child's routines: only the entries parents added. The earlier Bedtime and Naps values stay in storage and are
/// never part of this list. Two lists are equal when they hold the same entries in the same order.
/// </summary>
internal sealed record RoutinesValues(IReadOnlyList<RoutineEntry> Entries)
{
    public static readonly RoutinesValues Empty = new([]);

    public static RoutinesValues From(RoutinesRevision? row) =>
        new(string.IsNullOrEmpty(row?.EntriesJson) ? [] : JsonSerializer.Deserialize<RoutineEntry[]>(row.EntriesJson) ?? []);

    public string ToJson() => JsonSerializer.Serialize(Entries);

    public bool Equals(RoutinesValues? other) => other is not null && Entries.SequenceEqual(other.Entries);

    public override int GetHashCode() => Entries.Count;

    /// <summary>
    /// The update notice for a save (#128), by entry id only: <c>Fields</c> are the added, changed and removed entries;
    /// <c>Rows</c> the ones still on the page to highlight.
    /// </summary>
    public (IReadOnlyList<string> Fields, IReadOnlyList<string> Rows) ChangesTo(RoutinesValues next)
    {
        var before = Entries.ToDictionary(entry => entry.Id);
        var rows = next.Entries.Where(entry => !before.TryGetValue(entry.Id, out var saved) || saved != entry)
            .Select(entry => entry.Id.ToString()).ToList();
        var removed = Entries.Where(entry => next.Entries.All(item => item.Id != entry.Id))
            .Select(entry => entry.Id.ToString());
        return ([.. rows, .. removed], rows);
    }
}

internal sealed record RoutinesView(int Revision, RoutinesValues Values)
{
    public static RoutinesView From(RoutinesRevision? row) => new(row?.Revision ?? 0, RoutinesValues.From(row));
}

/// <summary>The whole list as the parent edited it.</summary>
internal sealed record RoutinesInput(IReadOnlyList<RoutineEntry?>? Entries);

internal sealed record SaveRoutinesRequest(int? Revision, RoutinesInput? Values);

/// <summary>
/// Adds one new routine to each chosen child (#498), in one save. <c>Visibility</c> is <c>shared</c> (the Shared list
/// both parents edit) or <c>mine</c> (the signed-in parent's own household list). The routine's id is ignored: each
/// child gets an entry of their own.
/// </summary>
internal sealed record AddRoutineRequest(RoutineEntry? Routine, IReadOnlyList<Guid>? ChildIds, string? Visibility);

internal sealed record AddedRoutine(Guid ChildId, RoutinesView Routines);

internal static class RoutinesEndpoints
{
    public const int EntryLimit = 30;
    public const int TitleLimit = 100;

    public static void Map(IEndpointRouteBuilder family)
    {
        family.MapPost("/essentials/routines", AddAsync).WithTags("Child Essentials");
        var routines = family.MapGroup("/children/{childId:guid}/essentials/routines").WithTags("Child Essentials");
        routines.MapGet("", GetAsync);
        routines.MapPut("", SaveAsync);
        routines.MapGet("/history", HistoryAsync);
        HouseholdRoutinesEndpoints.Map(routines);
    }

    /// <summary>
    /// The list a parent saved, trimmed and checked; null when the request has no list. Each entry keeps its id, so an
    /// edit is recognised as the same routine.
    /// </summary>
    public static RoutinesValues? Normalize(RoutinesInput? input, Dictionary<string, string[]> errors)
    {
        if (input?.Entries is not { } entries)
        {
            return null;
        }

        if (entries.Count > EntryLimit)
        {
            errors["entries"] = [$"Add up to {EntryLimit} routines."];
            return RoutinesValues.Empty;
        }

        var ids = new HashSet<Guid>();
        var list = new List<RoutineEntry>();
        foreach (var entry in entries)
        {
            if (entry is null || entry.Id == Guid.Empty || !ids.Add(entry.Id))
            {
                errors["entries"] = ["Each routine must have a unique identifier."];
                continue;
            }

            if (NormalizeEntry(entry, errors) is { } normalized)
            {
                list.Add(normalized);
            }
        }

        return new RoutinesValues(list);
    }

    private static RoutineEntry? NormalizeEntry(RoutineEntry entry, Dictionary<string, string[]> errors)
    {
        var title = ChildEssentialsAccess.Normalize(entry.Title, "title", TitleLimit, errors);
        var details = ChildEssentialsAccess.Normalize(entry.Details, "details", RoutinesRevision.TextLimit, errors);
        if (title is null)
        {
            errors["title"] = ["Enter a routine title."];
            return null;
        }

        return entry with { Title = title, Details = details };
    }

    /// <summary>A new revision of one list, carrying the earlier Bedtime and Naps values forward unchanged.</summary>
    public static RoutinesRevision NextRevision(
        ITenantContext tenant, Guid childId, Guid ownerId, RoutinesRevision? current, int? sharedRevision,
        RoutinesValues values, Guid userId, DateTimeOffset now) => new()
        {
            FamilyId = tenant.FamilyId,
            ChildProfileId = childId,
            OwnerMembershipId = ownerId,
            Revision = (current?.Revision ?? 0) + 1,
            SharedRevision = sharedRevision,
            Bedtime = current?.Bedtime,
            Naps = current?.Naps,
            EntriesJson = values.ToJson(),
            EditedByUserId = userId,
            EditedAt = now,
        };

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

        var errors = new Dictionary<string, string[]>();
        var values = Normalize(request.Values, errors);
        if (request.Revision is null or < 0 || values is null)
        {
            return TypedResults.BadRequest();
        }

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

            var row = await Revisions(db, childId).FirstOrDefaultAsync(ct);
            var current = RoutinesView.From(row);
            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            if (values == current.Values)
            {
                return TypedResults.Ok(current);
            }

            var next = NextRevision(tenant, childId, Guid.Empty, row, null, values, userId, clock.GetUtcNow());
            db.RoutinesRevisions.Add(next);
            var (fields, rows) = current.Values.ChangesTo(values);
            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.Routines, next.Revision,
                fields, next.EditedAt, ct, rows);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(RoutinesView.From(next));
        }, cancellationToken);
    }

    private static async Task<IResult> AddAsync(
        AddRoutineRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Routine is null || request.Visibility is not ("shared" or "mine") ||
            request.ChildIds is null or { Count: 0 or > ChildEndpoints.MaxChildren })
        {
            return TypedResults.BadRequest();
        }

        var errors = new Dictionary<string, string[]>();
        var routine = NormalizeEntry(request.Routine, errors);
        if (routine is null || errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var targets = request.ChildIds.Distinct().ToList();
        var ownerId = request.Visibility == "mine" ? tenant.MembershipId : Guid.Empty;
        var section = ownerId == Guid.Empty ? EssentialsSections.Routines : EssentialsSections.HouseholdRoutines;
        var userId = http.User.GetUserId()!.Value;
        return await work.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct))
            {
                return TypedResults.NotFound();
            }

            var activeIds = await db.Children.Where(child => child.Status == ChildStatus.Active)
                .Select(child => child.Id).ToListAsync(ct);
            if (!targets.All(activeIds.Contains))
            {
                return TypedResults.NotFound();
            }

            var now = clock.GetUtcNow();
            var added = new List<AddedRoutine>();
            foreach (var target in targets)
            {
                var row = await db.RoutinesRevisions.AsNoTracking()
                    .Where(item => item.ChildProfileId == target && item.OwnerMembershipId == ownerId)
                    .OrderByDescending(item => item.Revision).FirstOrDefaultAsync(ct);
                var current = RoutinesValues.From(row);
                if (current.Entries.Count >= EntryLimit)
                {
                    return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["entries"] = [$"A child can have up to {EntryLimit} routines in each list."],
                    });
                }

                var entry = routine with { Id = Guid.NewGuid() };
                // A household list keeps the revision the other parent agreed to; Shared has none.
                var next = NextRevision(tenant, target, ownerId, row, row?.SharedRevision,
                    new RoutinesValues([.. current.Entries, entry]), userId, now);
                db.RoutinesRevisions.Add(next);
                await EssentialsUpdateEndpoints.RecordAsync(db, tenant, target, section, next.Revision,
                    [entry.Id.ToString()], now, ct);
                added.Add(new AddedRoutine(target, RoutinesView.From(next)));
            }

            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(added);
        }, cancellationToken);
    }

    private static Task<IResult> HistoryAsync(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken cancellationToken) =>
        EssentialsHistory.PageAsync(childId, beforeRevision, http, tenant, db, directory, Revisions(db, childId), RoutinesValues.From, cancellationToken);

    private static IQueryable<RoutinesRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.RoutinesRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId && row.OwnerMembershipId == Guid.Empty)
            .OrderByDescending(row => row.Revision);
}
