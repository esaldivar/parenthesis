using System.Net;

namespace CoParent.IntegrationTests.Api;

/// <summary>The API serves the Angular app same-origin, without swallowing API, health or tooling routes.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class SpaHostingTests(ApiFactory api)
{
    [Theory]
    [InlineData("/")]
    [InlineData("/calendar")]
    [InlineData("/kid/diary")]
    [InlineData("/sign-in?returnUrl=%2Fsettings")]
    public async Task Client_routes_get_the_app_shell_without_caching(string path)
    {
        var response = await api.CreateClient().GetAsync(path, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains(ApiFactory.SpaMarker, await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.True(response.Headers.CacheControl?.NoCache);
    }

    [Theory]
    [InlineData("/api")]
    [InlineData("/api/does-not-exist")]
    [InlineData("/api/families/not-a-guid")]
    [InlineData("/health/unknown")]
    [InlineData("/swagger/index.html")] // Swagger is Development-only.
    public async Task Api_and_tooling_paths_never_fall_back_to_the_app(string path)
    {
        var response = await api.CreateClient().GetAsync(path, TestContext.Current.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.NotEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(ApiFactory.SpaMarker, body);
    }

    [Fact]
    public async Task Hashed_build_files_are_cached_long_term()
    {
        var response = await api.CreateClient().GetAsync("/main-ABC123.js", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.Public);
        Assert.Equal(TimeSpan.FromDays(365), response.Headers.CacheControl?.MaxAge);
    }
}
