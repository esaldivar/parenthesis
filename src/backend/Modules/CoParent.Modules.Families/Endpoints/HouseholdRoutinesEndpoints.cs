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

internal sealed record HouseholdRoutine(Guid OwnerId, string OwnerName, bool IsMine, RoutinesView Latest, RoutinesView? Shared, bool CanAccept);
internal sealed record HouseholdRoutineRequest(int Revision, string Action, RoutinesValues? Values);

internal static class HouseholdRoutinesEndpoints
{
    public static void Map(IEndpointRouteBuilder routes)
    {
        routes.MapGet("/households", GetAsync);
        routes.MapPut("/households/{ownerId:guid}", UpdateAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken ct)
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

        var parents = await Parents(db).ToListAsync(ct);
        var names = await directory.GetDisplayNamesAsync(parents.Select(parent => parent.UserId).ToList(), ct);
        var result = new List<HouseholdRoutine>();
        foreach (var parent in parents)
        {
            var revisions = Revisions(db, childId, parent.Id);
            var current = await revisions.FirstOrDefaultAsync(ct);
            var agreed = current?.SharedRevision is int revision
                ? await revisions.SingleAsync(row => row.Revision == revision, ct)
                : null;
            var latest = RoutinesView.From(current);
            var shared = agreed is null ? null : RoutinesView.From(agreed);
            var isMine = parent.Id == tenant.MembershipId;
            result.Add(new(parent.Id, names.GetValueOrDefault(parent.UserId, "Co-parent"), isMine, latest, shared,
                !isMine && latest.Values != new RoutinesValues(null, null) && latest.Values != shared?.Values));
        }

        return TypedResults.Ok(result);
    }

    private static async Task<IResult> UpdateAsync(
        Guid childId, Guid ownerId, HouseholdRoutineRequest request, HttpContext http,
        ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work, TimeProvider clock, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Revision < 0 || request.Action is not ("save" or "accept" or "stop"))
        {
            return TypedResults.BadRequest();
        }

        var isMine = ownerId == tenant.MembershipId;
        if ((request.Action == "save" && !isMine) || (request.Action == "accept" && isMine))
        {
            return TypedResults.Forbid();
        }

        var errors = new Dictionary<string, string[]>();
        var input = request.Values;
        if (request.Action == "save" && input is null)
        {
            return TypedResults.BadRequest();
        }

        var edited = new RoutinesValues(
            ChildEssentialsAccess.Normalize(input?.Bedtime, "bedtime", RoutinesRevision.TextLimit, errors),
            ChildEssentialsAccess.Normalize(input?.Naps, "naps", RoutinesRevision.TextLimit, errors));
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var userId = http.User.GetUserId()!.Value;
        return await work.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct) ||
                !await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct) ||
                !await Parents(db).AnyAsync(parent => parent.Id == ownerId, ct))
            {
                return TypedResults.NotFound();
            }

            var current = await Revisions(db, childId, ownerId).FirstOrDefaultAsync(ct);
            var view = RoutinesView.From(current);
            if (request.Revision != view.Revision)
            {
                return TypedResults.Conflict(view);
            }

            var values = request.Action == "save" ? edited : view.Values;
            var sharedRevision = current?.SharedRevision;
            switch (request.Action)
            {
                case "save" when values == view.Values:
                case "stop" when sharedRevision is null:
                    return TypedResults.Ok(view);
                case "stop":
                    sharedRevision = null;
                    break;
                case "accept" when values == new RoutinesValues(null, null):
                    return TypedResults.BadRequest();
                case "accept":
                    sharedRevision = view.Revision;
                    break;
            }

            var row = new RoutinesRevision
            {
                FamilyId = tenant.FamilyId,
                ChildProfileId = childId,
                OwnerMembershipId = ownerId,
                Revision = view.Revision + 1,
                SharedRevision = sharedRevision,
                Bedtime = values.Bedtime,
                Naps = values.Naps,
                EditedByUserId = userId,
                EditedAt = clock.GetUtcNow(),
            };
            db.RoutinesRevisions.Add(row);
            if (request.Action == "save")
            {
                // The owner revised their own routine: the co-parent's tab for it gets a dot (#128). Accepting it into
                // Shared or stopping sharing changes no routine text, so it makes no notice.
                await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.HouseholdRoutines, row.Revision,
                    EssentialsUpdateEndpoints.Changed(
                    ("bedtime", view.Values.Bedtime, values.Bedtime),
                    ("naps", view.Values.Naps, values.Naps)),
                    row.EditedAt, ct);
            }

            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(RoutinesView.From(row));
        }, cancellationToken);
    }

    private static IQueryable<FamilyMembership> Parents(FamiliesDbContext db) =>
        db.Memberships.AsNoTracking().Where(parent => parent.Role == FamilyRole.Parent && parent.Status == MembershipStatus.Active);

    private static IQueryable<RoutinesRevision> Revisions(FamiliesDbContext db, Guid childId, Guid ownerId) =>
        db.RoutinesRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId && row.OwnerMembershipId == ownerId)
            .OrderByDescending(row => row.Revision);
}
