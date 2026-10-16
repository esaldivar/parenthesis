using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Security;

namespace CoParent.Api.Hosting;

/// <summary>Marks endpoints that act inside one family, identified by the <c>{familyId}</c> route value.</summary>
internal sealed class FamilyScopedEndpointMetadata
{
    public const string RouteValue = "familyId";
}

internal static class TenantGateExtensions
{
    /// <summary>A route group for <c>/families/{familyId}/…</c> endpoints, which only active members can reach.</summary>
    public static RouteGroupBuilder MapFamilyScopedGroup(this RouteGroupBuilder api) =>
        api.MapGroup($"/families/{{{FamilyScopedEndpointMetadata.RouteValue}:guid}}")
            .WithMetadata(new FamilyScopedEndpointMetadata());

    public static IApplicationBuilder UseTenantGate(this IApplicationBuilder app) => app.UseMiddleware<TenantGateMiddleware>();
}

/// <summary>
/// ADR-0002, layer 1. For family-scoped endpoints, resolves the caller's active membership into the request's
/// tenant, or answers 404, the same as for a family that doesn't exist, so outsiders learn nothing. It runs as
/// middleware (after authorization, before model binding) so a malformed body can't produce a different answer
/// for non-members.
/// </summary>
internal sealed class TenantGateMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IFamilyMembershipReader memberships, TenantContext tenant)
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<FamilyScopedEndpointMetadata>() is null)
        {
            await next(context);
            return;
        }

        var userId = context.User.GetUserId();
        if (userId is null
            || !Guid.TryParse(context.GetRouteValue(FamilyScopedEndpointMetadata.RouteValue) as string, out var familyId)
            || await memberships.FindActiveAsync(familyId, userId.Value, context.RequestAborted) is not { } membership)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        tenant.Resolve(familyId, membership.MembershipId, membership.Role);
        await next(context);
    }
}
