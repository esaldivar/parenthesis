using System.Net;

namespace CoParent.IntegrationTests.Api;

[Collection(ApiCollectionDefinition.Name)]
public sealed class HealthEndpointTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Live_returns_healthy()
    {
        var response = await api.CreateClient().GetAsync("/health/live", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Ready_returns_healthy_when_postgres_is_reachable()
    {
        var response = await api.CreateClient().GetAsync("/health/ready", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Ready_returns_503_and_live_stays_healthy_when_postgres_is_unreachable()
    {
        // Nothing listens on port 1, so connections are refused immediately.
        await using var unreachable = api.WithWebHostBuilder(builder =>
            builder.UseSetting("ConnectionStrings:Postgres", "Host=127.0.0.1;Port=1;Database=none;Username=none;Password=none;Timeout=2"));
        var client = unreachable.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var ready = await client.GetAsync("/health/ready", ct);
        var live = await client.GetAsync("/health/live", ct);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, ready.StatusCode);
        Assert.Equal("Unhealthy", await ready.Content.ReadAsStringAsync(ct));
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
    }
}
