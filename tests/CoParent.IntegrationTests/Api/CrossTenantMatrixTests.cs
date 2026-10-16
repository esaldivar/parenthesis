using System.Net;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// ADR-0002: every endpoint under /api/families/{familyId}, discovered from the running app so new endpoints are
/// covered automatically, answers 404 to a signed-in user who isn't a member, whatever the method or body.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed partial class CrossTenantMatrixTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Every_family_scoped_endpoint_returns_404_to_a_non_member()
    {
        using var member = await ApiSession.SignedInAsync(api);
        using var outsider = await ApiSession.SignedInAsync(api);
        var familyId = await member.CreateFamilyAsync();

        var endpoints = FamilyScopedEndpoints();
        Assert.NotEmpty(endpoints); // Guards against passing vacuously.

        var failures = new List<string>();
        foreach (var (method, template) in endpoints)
        {
            var path = RouteParameter().Replace(template.Replace("{familyId:guid}", familyId.ToString(), StringComparison.Ordinal), _ => Guid.CreateVersion7().ToString());
            var response = method == "GET"
                ? await outsider.GetAsync(path)
                : await outsider.SendAsync(new HttpMethod(method), path, new { });

            if (response.StatusCode != HttpStatusCode.NotFound)
            {
                failures.Add($"{method} {template} → {(int)response.StatusCode}");
            }
        }

        Assert.Empty(failures);
    }

    private List<(string Method, string Template)> FamilyScopedEndpoints() => api.Services
        .GetRequiredService<EndpointDataSource>().Endpoints
        .OfType<RouteEndpoint>()
        .Where(e => e.RoutePattern.RawText?.Contains("{familyId", StringComparison.Ordinal) == true)
        .SelectMany(e => (e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods ?? ["GET"])
            .Select(m => (m, "/" + e.RoutePattern.RawText!.TrimStart('/').TrimEnd('/'))))
        .ToList();

    [GeneratedRegex(@"\{[^}]+\}")]
    private static partial Regex RouteParameter();
}
