using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Authorization;

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

    public static IApplicationBuilder UseTenantGate(this IApplicationBuilder app) =>
        app.UseMiddleware<ChildSessionGateMiddleware>().UseMiddleware<TenantGateMiddleware>();
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

        // A child session (ADR-0006) acts only in its own family, with the Child role. It has no membership row.
        if (context.User.GetChildSession() is { } child)
        {
            if (!Guid.TryParse(context.GetRouteValue(FamilyScopedEndpointMetadata.RouteValue) as string, out var childFamily)
                || childFamily != child.FamilyId)
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }

            tenant.Resolve(child.FamilyId, child.ChildId, FamilyRole.Child);
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

/// <summary>
/// ADR-0006: a child session may only use endpoints marked <see cref="ChildSessionAllowed"/>. Everything else that
/// needs sign-in answers 403, so parent-only features are never reachable by a child, including ones added later.
/// Anonymous endpoints (e.g. a parent signing back in with their password) stay available.
/// </summary>
internal sealed class ChildSessionGateMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var endpoint = context.GetEndpoint();
        if (context.User.GetChildSession() is not null
            && endpoint is not null
            && endpoint.Metadata.GetMetadata<IAllowAnonymous>() is null
            && endpoint.Metadata.GetMetadata<IAuthorizeData>() is not null
            && endpoint.Metadata.GetMetadata<ChildSessionAllowed>() is null)
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        await next(context);
    }
}
