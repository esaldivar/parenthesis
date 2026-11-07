using System.Text.Json;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record CaregiverDetails(string? Name, string? Phone, string? City, decimal? HourlyRate, bool SchoolPickup);
internal sealed record StoredCaregiver(Guid Id, CaregiverDetails Details, Guid AddedBy, Dictionary<Guid, int> Ratings);
internal sealed record CaregiverView(Guid Id, CaregiverDetails Details, decimal? AverageRating, int? MyRating, string AddedBy);
internal sealed record CaregiverListView(int Version, IReadOnlyList<CaregiverView> Caregivers);
internal sealed record SaveCaregiverRequest(int? Version, CaregiverDetails? Details, bool AllowDuplicate = false);
internal sealed record CaregiverRatingRequest(int? Rating);

internal static class SharedCaregiversEndpoints
{
    public static void Map(IEndpointRouteBuilder family)
    {
        var routes = family.MapGroup("/children/{childId:guid}/essentials/caregivers").WithTags("Child Essentials");
        routes.MapGet("", GetAsync);
        routes.MapPost("", AddAsync);
        routes.MapPut("/{caregiverId:guid}", EditAsync);
        routes.MapDelete("/{caregiverId:guid}", RemoveAsync);
        routes.MapPut("/{caregiverId:guid}/rating", RateAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        CoParent.Modules.Identity.Contracts.IUserDirectory directory, CancellationToken ct)
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

        var row = await db.SharedCaregivers.AsNoTracking().SingleOrDefaultAsync(list => list.ChildProfileId == childId, ct);
        var entries = Read(row);
        var names = await directory.GetDisplayNamesAsync(entries.Select(item => item.AddedBy).Distinct().ToList(), ct);
        var viewer = tenant.MembershipId;
        var parents = await db.Memberships.Where(parent => parent.Role == FamilyRole.Parent && parent.Status == MembershipStatus.Active)
            .Select(parent => parent.Id).ToListAsync(ct);
        var views = entries.Select(entry =>
        {
            var ratings = entry.Ratings.Where(pair => parents.Contains(pair.Key)).Select(pair => pair.Value).ToList();
            return new CaregiverView(entry.Id, entry.Details, ratings.Count == 0 ? null : ratings.Average(value => (decimal)value),
                entry.Ratings.TryGetValue(viewer, out var own) ? own : null,
                names.GetValueOrDefault(entry.AddedBy, "A parent"));
        }).OrderByDescending(item => item.AverageRating).ThenBy(item => item.Details.Name, StringComparer.OrdinalIgnoreCase).ToList();
        return TypedResults.Ok(new CaregiverListView(row?.Version ?? 0, views));
    }

    private static Task<IResult> AddAsync(Guid childId, SaveCaregiverRequest request, HttpContext http,
        ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work, CancellationToken ct) =>
        SaveAsync(childId, null, request, http, tenant, db, work, ct);

    private static Task<IResult> EditAsync(Guid childId, Guid caregiverId, SaveCaregiverRequest request, HttpContext http,
        ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work, CancellationToken ct) =>
        SaveAsync(childId, caregiverId, request, http, tenant, db, work, ct);

    private static Task<IResult> SaveAsync(Guid childId, Guid? caregiverId, SaveCaregiverRequest request, HttpContext http,
        ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work, CancellationToken ct) =>
        MutateAsync(childId, http, tenant, db, work, (row, entries) =>
        {
            if (request.Version is null or < 0 || request.Details is not { } input)
            {
                return TypedResults.BadRequest();
            }

            if (request.Version != row.Version)
            {
                return TypedResults.Conflict(new { code = "staleVersion" });
            }

            var errors = new Dictionary<string, string[]>();
            var name = ChildEssentialsAccess.Normalize(input.Name, "name", 100, errors);
            var phone = ChildEssentialsAccess.Normalize(input.Phone, "phone", 32, errors);
            var city = ChildEssentialsAccess.Normalize(input.City, "city", 100, errors);
            if (name is null)
            {
                errors["name"] = ["Enter a caregiver name."];
            }

            if (phone is null || Digits(phone).Length is < 7 or > 15 ||
                phone.Any(c => !char.IsAsciiDigit(c) && c is not ('+' or ' ' or '-' or '(' or ')' or '.')))
            {
                errors["phone"] = ["Enter a phone number with 7 to 15 digits."];
            }

            if (input.HourlyRate is < 0 or > 10000 ||
                (input.HourlyRate is decimal rate && decimal.Round(rate, 2) != rate))
            {
                errors["hourlyRate"] = ["Enter an hourly rate from 0 to 10,000 with up to two decimal places."];
            }

            if (errors.Count > 0)
            {
                return TypedResults.ValidationProblem(errors);
            }

            var duplicate = entries.Find(item => item.Id != caregiverId && Digits(item.Details.Phone!) == Digits(phone!));
            if (duplicate is not null && !request.AllowDuplicate)
            {
                return TypedResults.Conflict(new { duplicateName = duplicate.Details.Name, duplicatePhone = duplicate.Details.Phone });
            }

            var details = new CaregiverDetails(name, phone, city, input.HourlyRate, input.SchoolPickup);
            if (caregiverId is Guid id)
            {
                var index = entries.FindIndex(item => item.Id == id);
                if (index < 0)
                {
                    return TypedResults.NotFound();
                }

                entries[index] = entries[index] with { Details = details };
            }
            else
            {
                if (entries.Count >= 30)
                {
                    return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["caregivers"] = ["This list can hold up to 30 caregivers."] });
                }

                entries.Add(new(Guid.NewGuid(), details, http.User.GetUserId()!.Value, []));
            }

            row.Version++;
            return null;
        }, ct);

    private static Task<IResult> RemoveAsync(Guid childId, Guid caregiverId, int version, HttpContext http,
        ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work, CancellationToken ct) =>
        MutateAsync(childId, http, tenant, db, work, (row, entries) =>
        {
            if (version != row.Version)
            {
                return TypedResults.Conflict(new { code = "staleVersion" });
            }

            if (entries.RemoveAll(item => item.Id == caregiverId) == 0)
            {
                return TypedResults.NotFound();
            }

            row.Version++;
            return null;
        }, ct);

    private static Task<IResult> RateAsync(Guid childId, Guid caregiverId, CaregiverRatingRequest request, HttpContext http,
        ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work, CancellationToken ct) =>
        MutateAsync(childId, http, tenant, db, work, (_, entries) =>
        {
            if (request.Rating is < 1 or > 3)
            {
                return TypedResults.BadRequest();
            }

            var entry = entries.Find(item => item.Id == caregiverId);
            if (entry is null)
            {
                return TypedResults.NotFound();
            }

            if (request.Rating is int rating)
            {
                entry.Ratings[tenant.MembershipId] = rating;
            }
            else
            {
                entry.Ratings.Remove(tenant.MembershipId);
            }

            return null;
        }, ct);

    private static async Task<IResult> MutateAsync(Guid childId, HttpContext http, ITenantContext tenant,
        FamiliesDbContext db, IUnitOfWork work, Func<SharedCaregivers, List<StoredCaregiver>, IResult?> mutate, CancellationToken ct)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var userId = http.User.GetUserId()!.Value;
        return await work.ExecuteAsync<IResult>(async token =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, token) ||
                !await ChildEssentialsAccess.IsActiveChildAsync(db, childId, token))
            {
                return TypedResults.NotFound();
            }

            var existing = await db.SharedCaregivers.SingleOrDefaultAsync(item => item.ChildProfileId == childId, token);
            var row = existing ?? new SharedCaregivers { FamilyId = tenant.FamilyId, ChildProfileId = childId };
            var entries = Read(row);
            if (mutate(row, entries) is { } rejected)
            {
                return rejected;
            }

            if (existing is null)
            {
                db.SharedCaregivers.Add(row);
            }

            row.CaregiversJson = JsonSerializer.Serialize(entries);
            await db.SaveChangesAsync(token);
            return TypedResults.NoContent();
        }, ct);
    }

    private static List<StoredCaregiver> Read(SharedCaregivers? row) =>
        row is null ? [] : JsonSerializer.Deserialize<List<StoredCaregiver>>(row.CaregiversJson) ?? [];

    private static string Digits(string phone) => new(phone.Where(char.IsAsciiDigit).ToArray());
}
