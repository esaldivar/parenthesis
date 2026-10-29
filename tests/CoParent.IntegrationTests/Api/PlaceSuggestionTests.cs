using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Address suggestions while typing an event's location (#354). Google is never called: a fake answers in its place
/// and records what would have been sent. Synthetic addresses only.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class PlaceSuggestionTests(ApiFactory api) : IAsyncLifetime
{
    private const string GoogleUrl = "https://places.googleapis.com/v1/places:autocomplete";
    private const string TestKey = "test-places-key";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync()
    {
        api.Clock.Reset();
        return ValueTask.CompletedTask;
    }

    [Fact]
    public async Task Off_without_a_key_and_Google_is_never_called()
    {
        var google = new FakeGoogle();
        using var host = Host(google, key: null);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();

        var result = await SuggestAsync(dad, familyId, "100 Example");

        Assert.False(result.GetProperty("available").GetBoolean());
        Assert.Empty(result.GetProperty("suggestions").EnumerateArray());
        Assert.Empty(google.Requests);
    }

    [Fact]
    public async Task Switched_off_keeps_the_key_unused()
    {
        var google = new FakeGoogle();
        using var host = Host(google, settings: ("Places:Enabled", "false"));
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();

        Assert.False((await SuggestAsync(dad, familyId, "100 Example")).GetProperty("available").GetBoolean());
        Assert.Empty(google.Requests);
    }

    [Fact]
    public async Task A_parent_gets_suggestions_and_Google_gets_only_the_typed_text_and_session()
    {
        var google = new FakeGoogle("100 Example Ave, Springfield, IL, USA", "100 Example Ave, Shelbyville, IL, USA",
            "100 Example Ave, Springfield, IL, USA", "Example Park, Springfield, IL, USA", "Example Library", "Example School",
            "Example Pool");
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();
        var session = Guid.NewGuid().ToString();

        var result = await SuggestAsync(dad, familyId, "  100   Example\nAve ", session);

        Assert.True(result.GetProperty("available").GetBoolean());
        // At most three (owner decision), duplicates removed, in Google's order.
        Assert.Equal(
            ["100 Example Ave, Springfield, IL, USA", "100 Example Ave, Shelbyville, IL, USA", "Example Park, Springfield, IL, USA"],
            result.GetProperty("suggestions").EnumerateArray().Select(s => s.GetString()));
        var sent = Assert.Single(google.Requests);
        Assert.Equal(GoogleUrl, sent.Url);
        Assert.Equal(TestKey, sent.Key);
        Assert.Equal("suggestions.placePrediction.text.text", sent.FieldMask);
        // Only the tidied text and the session token: nothing about the family, its children or its events.
        Assert.Equal(["input", "sessionToken"], sent.Body.EnumerateObject().Select(p => p.Name).Order());
        Assert.Equal("100 Example Ave", sent.Body.GetProperty("input").GetString());
        Assert.Equal(session, sent.Body.GetProperty("sessionToken").GetString());
    }

    [Fact]
    public async Task Short_or_long_text_never_reaches_Google_and_odd_session_tokens_are_dropped()
    {
        var google = new FakeGoogle("Example Park");
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();

        var shortText = await SuggestAsync(dad, familyId, " 10 ");
        var longText = await SuggestAsync(dad, familyId, new string('a', 201));
        await SuggestAsync(dad, familyId, "Example Park", "not a token!");

        Assert.True(shortText.GetProperty("available").GetBoolean());
        Assert.Empty(shortText.GetProperty("suggestions").EnumerateArray());
        Assert.Empty(longText.GetProperty("suggestions").EnumerateArray());
        var sent = Assert.Single(google.Requests);
        Assert.False(sent.Body.TryGetProperty("sessionToken", out _));
    }

    [Fact]
    public async Task The_daily_cap_stops_suggestions_until_the_next_Pacific_day()
    {
        var google = new FakeGoogle("Example Park");
        using var host = Host(google, settings: ("Places:DailyLimit", "2"));
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();

        var first = await SuggestAsync(dad, familyId, "Example Park");
        var second = await SuggestAsync(dad, familyId, "Example Park");
        var third = await SuggestAsync(dad, familyId, "Example Park");
        api.Clock.Advance(TimeSpan.FromDays(1));
        var tomorrow = await SuggestAsync(dad, familyId, "Example Park");

        Assert.True(first.GetProperty("available").GetBoolean());
        Assert.True(second.GetProperty("available").GetBoolean());
        Assert.False(third.GetProperty("available").GetBoolean());
        Assert.Empty(third.GetProperty("suggestions").EnumerateArray());
        Assert.True(tomorrow.GetProperty("available").GetBoolean());
        Assert.Equal(3, google.Requests.Count);
    }

    [Fact]
    public async Task When_Google_fails_the_field_just_has_no_suggestions()
    {
        var google = new FakeGoogle { Status = HttpStatusCode.Forbidden };
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();

        var response = await dad.PostAsync(Path(familyId), new { input = "Example Park" });
        var result = await JsonAsync(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(result.GetProperty("available").GetBoolean());
        Assert.Empty(result.GetProperty("suggestions").EnumerateArray());
    }

    [Fact]
    public async Task Only_signed_in_parents_of_the_family_can_ask()
    {
        var google = new FakeGoogle("Example Park");
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();
        using var stranger = await ApiSession.SignedInAsync(host);
        await stranger.CreateFamilyAsync("Another Family");
        using var anonymous = await ApiSession.StartAsync(host);

        var fromStranger = await stranger.PostAsync(Path(familyId), new { input = "Example Park" });
        var fromAnonymous = await anonymous.PostAsync(Path(familyId), new { input = "Example Park" });
        var withoutAntiforgery = await dad.PostAsync(Path(familyId), new { input = "Example Park" }, withAntiforgery: false);

        Assert.Equal(HttpStatusCode.NotFound, fromStranger.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, fromAnonymous.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, withoutAntiforgery.StatusCode);
        Assert.Empty(google.Requests);
    }

    private WebApplicationFactory<Program> Host(FakeGoogle google, string? key = TestKey, params (string Key, string Value)[] settings) =>
        api.WithWebHostBuilder(builder =>
        {
            if (key is not null)
            {
                builder.UseSetting("Places:ApiKey", key);
            }

            foreach (var (name, value) in settings)
            {
                builder.UseSetting(name, value);
            }

            builder.ConfigureServices(services => services.Configure<HttpClientFactoryOptions>(
                "google-places", options => options.HttpMessageHandlerBuilderActions.Add(b => b.PrimaryHandler = google)));
        });

    private static string Path(Guid familyId) => $"/api/families/{familyId}/calendar/place-suggestions";

    private static async Task<JsonElement> SuggestAsync(ApiSession session, Guid familyId, string input, string? sessionToken = null)
    {
        var response = await session.PostAsync(Path(familyId), new { input, sessionToken });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await JsonAsync(response);
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

    private sealed record SentRequest(string Url, string? Key, string? FieldMask, JsonElement Body);

    /// <summary>Stands in for Google: answers with the given suggestion texts and records each request.</summary>
    private sealed class FakeGoogle(params string[] suggestions) : HttpMessageHandler
    {
        public ConcurrentQueue<SentRequest> Queue { get; } = new();

        public IReadOnlyList<SentRequest> Requests => [.. Queue];

        public HttpStatusCode Status { get; init; } = HttpStatusCode.OK;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = JsonSerializer.Deserialize<JsonElement>(await request.Content!.ReadAsStringAsync(cancellationToken));
            Queue.Enqueue(new SentRequest(
                request.RequestUri!.ToString(),
                request.Headers.TryGetValues("X-Goog-Api-Key", out var key) ? key.Single() : null,
                request.Headers.TryGetValues("X-Goog-FieldMask", out var mask) ? mask.Single() : null,
                body));
            var json = JsonSerializer.Serialize(new
            {
                suggestions = suggestions.Select(text => new { placePrediction = new { text = new { text } } }),
            });
            return new HttpResponseMessage(Status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        }
    }
}
