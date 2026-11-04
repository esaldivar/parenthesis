using System.Net;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;

namespace CoParent.IntegrationTests.Api;

/// <summary>First-load speed (#415): compressed app files, uncompressed API answers, and Server-Timing on every response.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed partial class PerformanceTests(ApiFactory api)
{
    [Theory]
    [InlineData("br")]
    [InlineData("gzip")]
    public async Task App_files_are_compressed_and_still_cached_long_term(string encoding)
    {
        var client = api.CreateClient(new() { AllowAutoRedirect = false });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/main-ABC123.js");
        request.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue(encoding));

        var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal([encoding], response.Content.Headers.ContentEncoding);
        Assert.Contains("Accept-Encoding", response.Headers.Vary);
        Assert.Equal(TimeSpan.FromDays(365), response.Headers.CacheControl?.MaxAge);
    }

    [Fact]
    public async Task Api_answers_are_never_compressed()
    {
        // Compressing a response that mixes a secret with reflected input would open it to BREACH.
        var client = api.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/antiforgery");
        request.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("br"));
        request.Headers.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));

        var response = await client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode);
        Assert.Empty(response.Content.Headers.ContentEncoding);
    }

    [Theory]
    [InlineData("/api/me")]
    [InlineData("/health/live")]
    [InlineData("/calendar")]
    public async Task Every_response_says_how_long_the_server_took_and_nothing_else(string path)
    {
        var response = await api.CreateClient().GetAsync(path, TestContext.Current.CancellationToken);

        var timing = Assert.Single(response.Headers.GetValues("Server-Timing"));
        Assert.Matches(ServerTiming(), timing);
    }

    // "app;dur=1.2", and on a replica's first request "app;dur=1.2, start;dur=3456.7". Durations only.
    [GeneratedRegex(@"^app;dur=\d+\.\d(, start;dur=\d+\.\d)?$")]
    private static partial Regex ServerTiming();
}
