using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.IntegrationTests.Api;

[Collection(ApiCollectionDefinition.Name)]
public sealed class ErrorHandlingTests(ApiFactory api) : IAsyncLifetime
{
    private const string ProblemJson = "application/problem+json";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Unknown_route_returns_404_problem_details_with_matching_trace_id()
    {
        var response = await api.CreateClient().GetAsync("/api/does-not-exist", TestContext.Current.CancellationToken);
        var problem = await ReadProblemAsync(response);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(ProblemJson, response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(404, problem.GetProperty("status").GetInt32());
        AssertTraceIdMatchesHeader(response, problem);
    }

    [Fact]
    public async Task Unhandled_exception_returns_500_problem_details_without_internal_details()
    {
        await using var failing = api.WithWebHostBuilder(b =>
            b.ConfigureServices(s => s.AddSingleton<IAntiforgery, ThrowingAntiforgery>()));
        var response = await failing.CreateClient().GetAsync("/api/antiforgery", TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        var problem = JsonDocument.Parse(body).RootElement;

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal(ProblemJson, response.Content.Headers.ContentType?.MediaType);
        Assert.Equal(500, problem.GetProperty("status").GetInt32());
        AssertTraceIdMatchesHeader(response, problem);

        // Exception messages and stack traces must never reach clients.
        Assert.DoesNotContain(ThrowingAntiforgery.SecretMessage, body, StringComparison.Ordinal);
        Assert.DoesNotContain(nameof(InvalidOperationException), body, StringComparison.Ordinal);
    }

    private static async Task<JsonElement> ReadProblemAsync(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)).RootElement;

    private static void AssertTraceIdMatchesHeader(HttpResponseMessage response, JsonElement problem)
    {
        var header = Assert.Single(response.Headers.GetValues("trace-id"));

        Assert.Matches("^[0-9a-f]{32}$", header);
        Assert.Equal(header, problem.GetProperty("traceId").GetString());
    }
}
