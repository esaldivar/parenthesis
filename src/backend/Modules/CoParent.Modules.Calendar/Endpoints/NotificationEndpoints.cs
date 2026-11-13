using CoParent.Modules.Calendar.Domain;
using CoParent.Modules.Calendar.Infrastructure.Persistence;
using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Endpoints;

internal static class NotificationEndpoints
{
    private const int PageSize = 50;

    public static void Map(IEndpointRouteBuilder family)
    {
        var group = family.MapGroup("/notifications").WithTags("Notifications");
        group.MapGet("/", ListAsync);
        group.MapGet("/unseen", UnseenAsync);
        group.MapPost("/seen", MarkSeenAsync);
    }

    private static IQueryable<CalendarNotice> ForParent(CalendarDbContext db, ITenantContext tenant) =>
        db.Notifications.Where(n => n.RecipientMembershipId == tenant.MembershipId);

    private static async Task<IResult> ListAsync(
        HttpContext http, CalendarDbContext db, ITenantContext tenant, IFamilyRoster roster, TimeProvider clock, CancellationToken ct,
        int offset = 0)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return Results.Forbid();
        }

        http.Response.Headers.CacheControl = "no-store";
        var cutoff = clock.GetUtcNow().AddDays(-7);
        var items = await ForParent(db, tenant)
            .Where(n => n.SeenAt == null || n.SeenAt > cutoff)
            .OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.Id)
            .Skip(Math.Max(0, offset)).Take(PageSize + 1)
            .Select(n => new
            {
                n.Id,
                n.Kind,
                n.CreatedAt,
                Seen = n.SeenAt != null,
                n.EventId,
                EventStart = n.Kind == CalendarNoticeKind.Cancelled ? null : db.Events
                    .Where(e => e.Id == n.EventId && e.Status == EventStatus.Confirmed && e.Category != EventCategory.Unavailable)
                    .Select(e => (DateTimeOffset?)e.StartsAt).FirstOrDefault(),
            })
            .ToListAsync(ct);
        var zone = await roster.TimeZoneAsync(ct);
        return Results.Ok(new
        {
            Items = items.Take(PageSize).Select(n => new
            {
                n.Id,
                n.Kind,
                n.CreatedAt,
                n.Seen,
                EventId = n.EventStart.HasValue ? (Guid?)n.EventId : null,
                EventDate = n.EventStart is { } startsAt ? (DateOnly?)EventSchedule.LocalDate(startsAt, zone) : null,
            }),
            HasMore = items.Count > PageSize,
        });
    }

    private static async Task<IResult> UnseenAsync(
        HttpContext http, CalendarDbContext db, ITenantContext tenant, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return Results.Forbid();
        }

        http.Response.Headers.CacheControl = "no-store";
        return Results.Ok(new { Unseen = await ForParent(db, tenant).AnyAsync(n => n.SeenAt == null, ct) });
    }

    private static async Task<IResult> MarkSeenAsync(
        SeenRequest request, CalendarDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return Results.Forbid();
        }

        if (request.Ids is not { Count: > 0 and <= PageSize })
        {
            return Results.BadRequest();
        }

        var now = clock.GetUtcNow();
        await ForParent(db, tenant).Where(n => n.SeenAt == null && request.Ids.Contains(n.Id))
            .ExecuteUpdateAsync(set => set.SetProperty(n => n.SeenAt, now), ct);
        return Results.NoContent();
    }

    internal sealed record SeenRequest(IReadOnlyList<Guid>? Ids);
}
