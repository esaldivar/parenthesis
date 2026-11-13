using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CoParent.Modules.Calendar.Contracts;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// One-way copies of the family calendar to parents' Google Calendars (#386). Google is never called: a fake answers
/// for its OAuth and Calendar APIs, keeps the calendars it was asked to make, and records every request. Synthetic
/// family data only.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class GoogleCalendarSyncTests(ApiFactory api) : IAsyncLifetime
{
    private const string ClientId = "test-client.apps.googleusercontent.com";
    private const string ClientSecret = "test-client-secret";
    private const string Scope = "https://www.googleapis.com/auth/calendar.app.created";

    // Midnight in Chicago, Monday October 12, 2026 (CDT). The hosts copy a ten-year window, so these fixed dates stay in range.
    private static readonly DateTimeOffset _monday = new(2026, 10, 12, 0, 0, 0, TimeSpan.FromHours(-5));

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync()
    {
        api.Clock.Reset();
        return ValueTask.CompletedTask;
    }

    [Fact]
    public async Task Off_without_a_Google_client_and_Google_is_never_called()
    {
        var google = new FakeGoogle();
        using var host = Host(google, configured: false);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();

        var status = await JsonAsync(await dad.GetAsync(Path(familyId)));
        var authorize = await dad.PostAsync($"{Path(familyId)}/authorize");
        var writes = await host.Services.GetRequiredService<IGoogleCalendarSync>().SyncAsync(TestContext.Current.CancellationToken);

        Assert.False(status.GetProperty("available").GetBoolean());
        Assert.Equal("NotConnected", status.GetProperty("state").GetString());
        Assert.Equal(HttpStatusCode.Conflict, authorize.StatusCode);
        Assert.Equal(0, writes);
        Assert.Empty(google.Requests);
    }

    [Fact]
    public async Task Connecting_asks_only_for_the_app_created_calendar_scope_and_makes_the_Parenthesis_Family_calendar()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync(timeZone: "America/Chicago");

        var url = new Uri((await JsonAsync(await dad.PostAsync($"{Path(familyId)}/authorize"))).GetProperty("url").GetString()!);
        var query = QueryHelpers.ParseQuery(url.Query);
        google.ExpectedChallenge = query["code_challenge"].ToString();
        var connected = await dad.PostAsync($"{Path(familyId)}/connect", new { code = FakeGoogle.GoodCode, state = query["state"].ToString() });
        var view = await JsonAsync(connected);

        Assert.Equal("https://accounts.google.com/o/oauth2/v2/auth", url.GetLeftPart(UriPartial.Path));
        Assert.Equal(Scope, query["scope"].ToString());
        Assert.Equal(ClientId, query["client_id"].ToString());
        Assert.Equal($"{ApiFactory.PublicBaseUrl}/settings/google-calendar", query["redirect_uri"].ToString());
        Assert.Equal("S256", query["code_challenge_method"].ToString());
        Assert.Equal("offline", query["access_type"].ToString());
        Assert.Equal(HttpStatusCode.OK, connected.StatusCode);
        Assert.Equal("Connected", view.GetProperty("state").GetString());
        Assert.Equal("Parenthesis Family", view.GetProperty("calendarName").GetString());
        var calendar = Assert.Single(google.Calendars.Values);
        Assert.Equal("Parenthesis Family", calendar.Summary);
        Assert.Equal("America/Chicago", calendar.TimeZone);

        // The refresh token is stored encrypted and never sent back to the browser.
        Assert.DoesNotContain(FakeGoogle.RefreshTokenFor(1), view.GetRawText(), StringComparison.Ordinal);
        var stored = await api.QueryScalarAsync<string>("SELECT protected_refresh_token FROM calendar.google_connections");
        Assert.NotNull(stored);
        Assert.DoesNotContain(FakeGoogle.RefreshTokenFor(1), stored, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Only_confirmed_events_are_copied_and_the_co_parents_unavailable_time_stays_private()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        var f = await FamilyAsync(host);
        using var _ = f;
        await ConnectAsync(f.Dad, f.FamilyId, google);
        await ChooseAsync(f.Dad, f.FamilyId, _allTypes);
        var soccer = await CreateAsync(f.Dad, f, new
        {
            category = "Activity",
            title = "Soccer Practice",
            startsAt = _monday.AddHours(17),
            endsAt = _monday.AddHours(18),
            location = "100 Example Park",
            notes = "Bring shin guards",
            childIds = new[] { f.KaiId },
        });
        await CreateAsync(f.Mom, f, new
        {
            category = "Unavailable",
            startsAt = _monday.AddHours(9),
            endsAt = _monday.AddHours(12),
            location = "Example Clinic",
            notes = "Private appointment",
        });
        var parenting = await CreateAsync(f.Dad, f, new
        {
            category = "ParentingTime",
            title = "Time with Dad",
            startsAt = _monday,
            endsAt = _monday.AddDays(3),
            allDay = true,
            childIds = new[] { f.KaiId },
            caregiverMembershipId = f.DadMembershipId,
        });

        await SyncAsync(host);

        var events = Assert.Single(google.Calendars.Values).Events;
        Assert.Equal(2, events.Count);
        var copied = events[Id(soccer)];
        Assert.Equal("Soccer Practice", copied["summary"]!.GetValue<string>());
        Assert.Equal("100 Example Park", copied["location"]!.GetValue<string>());
        Assert.StartsWith("Bring shin guards", copied["description"]!.GetValue<string>(), StringComparison.Ordinal);
        Assert.Equal("2026-10-12T22:00:00Z", copied["start"]!["dateTime"]!.GetValue<string>());
        Assert.Equal("America/Chicago", copied["start"]!["timeZone"]!.GetValue<string>());
        var unavailable = events.Values.Single(e => e["summary"]!.GetValue<string>() == "Unavailable");
        Assert.Null(unavailable["location"]);
        Assert.DoesNotContain("Private appointment", unavailable.ToJsonString(), StringComparison.Ordinal);
        Assert.DoesNotContain("Example Clinic", unavailable.ToJsonString(), StringComparison.Ordinal);

        // The proposal reaches Google only once Mom agrees, as all-day dates with Google's exclusive end.
        Assert.False(events.ContainsKey(Id(parenting)));
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{parenting.GetProperty("changeRequestId").GetGuid()}/approve");
        await SyncAsync(host);
        var approved = events[Id(parenting)];
        Assert.Equal("2026-10-12", approved["start"]!["date"]!.GetValue<string>());
        Assert.Equal("2026-10-15", approved["end"]!["date"]!.GetValue<string>());

        // Nothing changed, nothing sent.
        var before = google.Requests.Count;
        Assert.Equal(0, await SyncAsync(host));
        Assert.Equal(before, google.Requests.Count);
    }

    [Fact]
    public async Task Edits_and_cancellations_follow_and_a_pending_change_keeps_the_confirmed_values()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        var f = await FamilyAsync(host);
        using var _ = f;
        await ConnectAsync(f.Mom, f.FamilyId, google);
        var soccer = await CreateAsync(f.Dad, f, new { category = "Activity", title = "Soccer", startsAt = _monday.AddHours(17), endsAt = _monday.AddHours(18) });
        var parenting = await CreateAsync(f.Dad, f, new
        {
            category = "ParentingTime",
            title = "Time with Dad",
            startsAt = _monday,
            endsAt = _monday.AddDays(3),
            allDay = true,
            childIds = new[] { f.KaiId },
            caregiverMembershipId = f.DadMembershipId,
        });
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{parenting.GetProperty("changeRequestId").GetGuid()}/approve");
        await SyncAsync(host);
        var events = Assert.Single(google.Calendars.Values).Events;

        await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{soccer.GetProperty("id").GetGuid()}", new { title = "Soccer Game" });
        // Dad proposes moving his time; until Mom answers, Google keeps the agreed dates.
        await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{parenting.GetProperty("id").GetGuid()}", new { endsAt = _monday.AddDays(4) });
        await SyncAsync(host);

        Assert.Equal("Soccer Game", events[Id(soccer)]["summary"]!.GetValue<string>());
        Assert.Equal("2026-10-15", events[Id(parenting)]["end"]!["date"]!.GetValue<string>());

        await f.Dad.SendAsync(HttpMethod.Delete, $"{Events(f)}/{soccer.GetProperty("id").GetGuid()}");
        await SyncAsync(host);

        Assert.False(events.ContainsKey(Id(soccer)));
        Assert.True(events.ContainsKey(Id(parenting)));
    }

    [Fact]
    public async Task Each_parent_has_their_own_copy_and_the_co_parent_is_unaffected()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        var f = await FamilyAsync(host);
        using var _ = f;
        await ConnectAsync(f.Dad, f.FamilyId, google);
        await ChooseAsync(f.Dad, f.FamilyId, _allTypes);
        await CreateAsync(f.Mom, f, new { category = "Unavailable", startsAt = _monday.AddHours(9), endsAt = _monday.AddHours(12), notes = "Mom's note" });

        await SyncAsync(host);
        var momsView = await JsonAsync(await f.Mom.GetAsync(Path(f.FamilyId)));

        Assert.Equal("NotConnected", momsView.GetProperty("state").GetString());
        Assert.Equal("Unavailable", Assert.Single(Assert.Single(google.Calendars.Values).Events.Values)["summary"]!.GetValue<string>());

        // Mom's own copy shows her own notes, as Parenthesis does.
        await ConnectAsync(f.Mom, f.FamilyId, google);
        await SyncAsync(host);
        var momsCalendar = google.Calendars.Values.Single(c => c.Events.Values.Any(e => e["description"]!.GetValue<string>().StartsWith("Mom's note", StringComparison.Ordinal)));
        Assert.Equal(2, google.Calendars.Count);
        Assert.Single(momsCalendar.Events);
    }

    [Fact]
    public async Task Each_parent_chooses_which_kinds_of_event_to_copy_and_unticked_ones_leave_Google()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        var f = await FamilyAsync(host);
        using var _ = f;
        var beforeConnecting = await f.Dad.SendAsync(HttpMethod.Put, $"{Path(f.FamilyId)}/copy-types", new { copyTypes = _allTypes });
        await ConnectAsync(f.Dad, f.FamilyId, google);
        var defaults = await JsonAsync(await f.Dad.GetAsync(Path(f.FamilyId)));
        var school = await CreateAsync(f.Dad, f, new { category = "School", title = "Picture Day", startsAt = _monday.AddHours(8), endsAt = _monday.AddHours(9) });
        var dentist = await CreateAsync(f.Dad, f, new { category = "Dental", title = "Cleaning", startsAt = _monday.AddHours(10), endsAt = _monday.AddHours(11) });
        await CreateAsync(f.Mom, f, new { category = "Unavailable", startsAt = _monday.AddHours(12), endsAt = _monday.AddHours(13) });
        await CreateAsync(f.Dad, f, new { category = "Unavailable", startsAt = _monday.AddHours(14), endsAt = _monday.AddHours(15) });
        await SyncAsync(host);
        var events = Assert.Single(google.Calendars.Values).Events;

        // By default everything but the co-parent's unavailable time.
        Assert.Equal(HttpStatusCode.NotFound, beforeConnecting.StatusCode);
        Assert.DoesNotContain("CoParentUnavailable", defaults.GetProperty("copyTypes").EnumerateArray().Select(t => t.GetString()));
        Assert.Contains("MyUnavailable", defaults.GetProperty("copyTypes").EnumerateArray().Select(t => t.GetString()));
        Assert.Equal(3, events.Count);
        Assert.True(events.ContainsKey(Id(school)));

        var chosen = await ChooseAsync(f.Dad, f.FamilyId, ["Dental", "Activity"]);
        await SyncAsync(host);

        Assert.Equal(["Dental", "Activity"], chosen.GetProperty("copyTypes").EnumerateArray().Select(t => t.GetString()));
        Assert.Equal([Id(dentist)], events.Keys);

        // Mom's choices are her own and haven't changed.
        var moms = await JsonAsync(await f.Mom.GetAsync(Path(f.FamilyId)));
        Assert.Contains("School", moms.GetProperty("copyTypes").EnumerateArray().Select(t => t.GetString()));
        var bad = await f.Dad.SendAsync(HttpMethod.Put, $"{Path(f.FamilyId)}/copy-types", new { copyTypes = _unknownType });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
    }

    [Fact]
    public async Task A_state_from_another_parent_or_a_tampered_state_is_refused()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        var f = await FamilyAsync(host);
        using var _ = f;
        var url = new Uri((await JsonAsync(await f.Dad.PostAsync($"{Path(f.FamilyId)}/authorize"))).GetProperty("url").GetString()!);
        var state = QueryHelpers.ParseQuery(url.Query)["state"].ToString();

        var asMom = await f.Mom.PostAsync($"{Path(f.FamilyId)}/connect", new { code = FakeGoogle.GoodCode, state });
        var tampered = await f.Dad.PostAsync($"{Path(f.FamilyId)}/connect", new { code = FakeGoogle.GoodCode, state = state[..^4] + "AAAA" });
        var noCode = await f.Dad.PostAsync($"{Path(f.FamilyId)}/connect", new { state });

        Assert.Equal(HttpStatusCode.BadRequest, asMom.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tampered.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, noCode.StatusCode);
        Assert.Empty(google.Requests);
    }

    [Fact]
    public async Task Declining_calendar_access_on_Googles_consent_page_connects_nothing()
    {
        var google = new FakeGoogle { GrantedScope = "openid" };
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();

        var response = await TryConnectAsync(dad, familyId, google);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(google.Calendars);
        Assert.Contains(google.Requests, r => r.Url.EndsWith("/revoke", StringComparison.Ordinal));
        Assert.Equal("NotConnected", (await JsonAsync(await dad.GetAsync(Path(familyId)))).GetProperty("state").GetString());
    }

    [Fact]
    public async Task Revoked_access_stops_the_copy_until_the_parent_reconnects()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        var f = await FamilyAsync(host);
        using var _ = f;
        await ConnectAsync(f.Dad, f.FamilyId, google);
        await CreateAsync(f.Dad, f, new { category = "Activity", title = "Soccer", startsAt = _monday.AddHours(17), endsAt = _monday.AddHours(18) });
        google.RevokeEverything();
        api.Clock.Advance(TimeSpan.FromHours(2));

        await SyncAsync(host);
        var stopped = await JsonAsync(await f.Dad.GetAsync(Path(f.FamilyId)));

        Assert.Equal("NeedsReconnect", stopped.GetProperty("state").GetString());
        Assert.Equal("AccessRevoked", stopped.GetProperty("problem").GetString());
        Assert.Empty(Assert.Single(google.Calendars.Values).Events);

        await ConnectAsync(f.Dad, f.FamilyId, google);
        await SyncAsync(host);

        Assert.Equal("Connected", (await JsonAsync(await f.Dad.GetAsync(Path(f.FamilyId)))).GetProperty("state").GetString());
        Assert.Single(google.Calendars.Values.Single(c => !c.Events.IsEmpty).Events);
    }

    [Fact]
    public async Task Deleting_the_calendar_in_Google_stops_the_copy()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        var f = await FamilyAsync(host);
        using var _ = f;
        await ConnectAsync(f.Dad, f.FamilyId, google);
        google.Calendars.Clear();
        await CreateAsync(f.Dad, f, new { category = "Activity", title = "Soccer", startsAt = _monday.AddHours(17), endsAt = _monday.AddHours(18) });

        await SyncAsync(host);
        var stopped = await JsonAsync(await f.Dad.GetAsync(Path(f.FamilyId)));

        Assert.Equal("NeedsReconnect", stopped.GetProperty("state").GetString());
        Assert.Equal("CalendarRemoved", stopped.GetProperty("problem").GetString());
    }

    [Fact]
    public async Task Disconnecting_removes_the_calendar_revokes_access_and_stops_copying()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        var f = await FamilyAsync(host);
        using var _ = f;
        await ConnectAsync(f.Dad, f.FamilyId, google);
        await CreateAsync(f.Dad, f, new { category = "Activity", title = "Soccer", startsAt = _monday.AddHours(17), endsAt = _monday.AddHours(18) });
        await SyncAsync(host);

        var disconnected = await f.Dad.SendAsync(HttpMethod.Delete, Path(f.FamilyId));
        var view = await JsonAsync(await f.Dad.GetAsync(Path(f.FamilyId)));
        var before = google.Requests.Count;
        await CreateAsync(f.Dad, f, new { category = "Activity", title = "Swim", startsAt = _monday.AddHours(19), endsAt = _monday.AddHours(20) });
        await SyncAsync(host);

        Assert.Equal(HttpStatusCode.NoContent, disconnected.StatusCode);
        Assert.Equal("NotConnected", view.GetProperty("state").GetString());
        Assert.Empty(google.Calendars);
        Assert.Contains(google.Requests, r => r.Url.EndsWith("/revoke", StringComparison.Ordinal));
        Assert.Equal(before, google.Requests.Count);
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM calendar.google_connections"));
    }

    [Fact]
    public async Task Only_signed_in_parents_of_the_family_can_connect()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();
        using var stranger = await ApiSession.SignedInAsync(host);
        await stranger.CreateFamilyAsync("Another Family");
        using var anonymous = await ApiSession.StartAsync(host);

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Path(familyId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync($"{Path(familyId)}/authorize")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync($"{Path(familyId)}/authorize")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await dad.PostAsync($"{Path(familyId)}/authorize", withAntiforgery: false)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await dad.SendAsync(HttpMethod.Delete, Path(familyId), withAntiforgery: false)).StatusCode);
        Assert.Empty(google.Requests);
    }

    [Fact]
    public async Task A_parent_leaving_the_family_takes_their_connection_with_them()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();
        await ConnectAsync(dad, familyId, google);

        var deleted = await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password });

        Assert.True(deleted.IsSuccessStatusCode, $"Account deletion returned {deleted.StatusCode}");
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM calendar.google_connections"));
    }

    private WebApplicationFactory<Program> Host(FakeGoogle google, bool configured = true) =>
        api.WithWebHostBuilder(builder =>
        {
            if (configured)
            {
                builder.UseSetting("GoogleCalendar:ClientId", ClientId);
                builder.UseSetting("GoogleCalendar:ClientSecret", ClientSecret);
            }

            builder.UseSetting("GoogleCalendar:BackgroundSync", "false");
            builder.UseSetting("GoogleCalendar:PastWindow", "3650.00:00:00");
            builder.UseSetting("GoogleCalendar:FutureWindow", "3650.00:00:00");
            builder.ConfigureServices(services => services.Configure<HttpClientFactoryOptions>(
                "google-calendar", options => options.HttpMessageHandlerBuilderActions.Add(b => b.PrimaryHandler = google)));
        });

    private static async Task ConnectAsync(ApiSession parent, Guid familyId, FakeGoogle google)
    {
        var response = await TryConnectAsync(parent, familyId, google);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<HttpResponseMessage> TryConnectAsync(ApiSession parent, Guid familyId, FakeGoogle google)
    {
        var url = new Uri((await JsonAsync(await parent.PostAsync($"{Path(familyId)}/authorize"))).GetProperty("url").GetString()!);
        var query = QueryHelpers.ParseQuery(url.Query);
        google.ExpectedChallenge = query["code_challenge"].ToString();
        return await parent.PostAsync($"{Path(familyId)}/connect", new { code = FakeGoogle.GoodCode, state = query["state"].ToString() });
    }

    private static readonly string[] _unknownType = ["Gossip"];

    private static readonly string[] _allTypes =
        ["ParentingTime", "Joint", "School", "Medical", "Dental", "Activity", "Birthday", "Holiday", "Other", "MyUnavailable", "CoParentUnavailable"];

    private static async Task<JsonElement> ChooseAsync(ApiSession parent, Guid familyId, string[] copyTypes)
    {
        var response = await parent.SendAsync(HttpMethod.Put, $"{Path(familyId)}/copy-types", new { copyTypes });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await JsonAsync(response);
    }

    private static async Task<int> SyncAsync(WebApplicationFactory<Program> host) =>
        await host.Services.GetRequiredService<IGoogleCalendarSync>().SyncAsync(TestContext.Current.CancellationToken);

    private static async Task<JsonElement> CreateAsync(ApiSession session, Family f, object body)
    {
        var response = await session.PostAsync(Events(f), body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await JsonAsync(response);
    }

    private static string Id(JsonElement created) => created.GetProperty("id").GetGuid().ToString("N");

    private static string Path(Guid familyId) => $"/api/families/{familyId}/google-calendar";

    private static string Events(Family f) => $"/api/families/{f.FamilyId}/calendar/events";

    /// <summary>Dad and Mom, and Kai approved by both.</summary>
    private static async Task<Family> FamilyAsync(WebApplicationFactory<Program> host)
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(host, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(host, displayName: "Mom", email: momEmail);
        await mom.PostAsync("/api/invitations/accept", new { token });
        await mom.PostAsync($"/api/families/{familyId}/approvals/{kai.GetProperty("changeRequestId").GetGuid()}/approve");
        var members = (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"))).GetProperty("members").EnumerateArray().ToList();
        var dadMembership = members.Single(m => m.GetProperty("displayName").GetString() == "Dad").GetProperty("membershipId").GetGuid();
        return new Family(dad, mom, familyId, kai.GetProperty("id").GetGuid(), dadMembership);
    }

    private sealed record Family(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId, Guid DadMembershipId) : IDisposable
    {
        public void Dispose()
        {
            Dad.Dispose();
            Mom.Dispose();
        }
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

    private sealed record SentRequest(HttpMethod Method, string Url);

    private sealed class FakeCalendar(string summary, string timeZone)
    {
        public string Summary { get; } = summary;

        public string TimeZone { get; } = timeZone;

        public ConcurrentDictionary<string, JsonObject> Events { get; } = new();
    }

    /// <summary>Stands in for Google's OAuth and Calendar APIs, keeping calendars in memory.</summary>
    private sealed class FakeGoogle : HttpMessageHandler
    {
        public const string GoodCode = "good-code";
        private readonly ConcurrentQueue<SentRequest> _requests = new();
        private readonly ConcurrentDictionary<string, bool> _validAccess = new();
        private readonly ConcurrentDictionary<string, bool> _validRefresh = new();
        private int _issued;

        public IReadOnlyList<SentRequest> Requests => [.. _requests];

        public ConcurrentDictionary<string, FakeCalendar> Calendars { get; } = new();

        public string? ExpectedChallenge { get; set; }

        public string GrantedScope { get; init; } = Scope;

        public static string RefreshTokenFor(int n) => $"refresh-token-{n}";

        public void RevokeEverything()
        {
            _validAccess.Clear();
            _validRefresh.Clear();
        }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri!;
            _requests.Enqueue(new SentRequest(request.Method, url.GetLeftPart(UriPartial.Path)));
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken);

            if (url.Host == "oauth2.googleapis.com" && url.AbsolutePath == "/token")
            {
                return Token(QueryHelpers.ParseQuery(body));
            }

            if (url.Host == "oauth2.googleapis.com" && url.AbsolutePath == "/revoke")
            {
                var token = QueryHelpers.ParseQuery(body)["token"].ToString();
                _validRefresh.TryRemove(token, out _);
                _validAccess.TryRemove(token, out _);
                return Status(HttpStatusCode.OK);
            }

            if (request.Headers.Authorization?.Parameter is not { } bearer || !_validAccess.ContainsKey(bearer))
            {
                return Status(HttpStatusCode.Unauthorized);
            }

            var path = url.AbsolutePath.Split('/', StringSplitOptions.RemoveEmptyEntries).Select(Uri.UnescapeDataString).ToArray();
            return (request.Method.Method, path) switch
            {
                ("POST", ["calendar", "v3", "calendars"]) => CreateCalendar(JsonNode.Parse(body)!.AsObject()),
                ("GET", ["calendar", "v3", "calendars", var id]) => Status(Calendars.ContainsKey(id) ? HttpStatusCode.OK : HttpStatusCode.NotFound),
                ("DELETE", ["calendar", "v3", "calendars", var id]) => Status(Calendars.TryRemove(id, out _) ? HttpStatusCode.NoContent : HttpStatusCode.NotFound),
                ("PUT", ["calendar", "v3", "calendars", var id, "events", var eventId]) =>
                    Calendars.TryGetValue(id, out var calendar) && calendar.Events.ContainsKey(eventId)
                        ? Store(calendar, eventId, JsonNode.Parse(body)!.AsObject())
                        : Status(HttpStatusCode.NotFound),
                ("POST", ["calendar", "v3", "calendars", var id, "events"]) when JsonNode.Parse(body)!.AsObject() is var inserted =>
                    Calendars.TryGetValue(id, out var calendar)
                        ? Store(calendar, inserted["id"]!.GetValue<string>(), inserted)
                        : Status(HttpStatusCode.NotFound),
                ("DELETE", ["calendar", "v3", "calendars", var id, "events", var eventId]) =>
                    Status(Calendars.TryGetValue(id, out var calendar) && calendar.Events.TryRemove(eventId, out _) ? HttpStatusCode.NoContent : HttpStatusCode.Gone),
                _ => Status(HttpStatusCode.BadRequest),
            };
        }

        private HttpResponseMessage Token(Dictionary<string, Microsoft.Extensions.Primitives.StringValues> form)
        {
            if (form["client_id"] != ClientId || form["client_secret"] != ClientSecret)
            {
                return Json(HttpStatusCode.Unauthorized, new { error = "invalid_client" });
            }

            var n = Interlocked.Increment(ref _issued);
            var access = $"access-token-{n}";
            if (form["grant_type"] == "authorization_code")
            {
                var verifier = form["code_verifier"].ToString();
                var challenge = WebEncoders.Base64UrlEncode(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
                if (form["code"] != GoodCode || challenge != ExpectedChallenge)
                {
                    return Json(HttpStatusCode.BadRequest, new { error = "invalid_grant" });
                }

                _validAccess[access] = true;
                _validRefresh[RefreshTokenFor(n)] = true;
                return Json(HttpStatusCode.OK, new { access_token = access, refresh_token = RefreshTokenFor(n), expires_in = 3599, scope = GrantedScope });
            }

            if (!_validRefresh.ContainsKey(form["refresh_token"].ToString()))
            {
                return Json(HttpStatusCode.BadRequest, new { error = "invalid_grant" });
            }

            _validAccess[access] = true;
            return Json(HttpStatusCode.OK, new { access_token = access, expires_in = 3599, scope = GrantedScope });
        }

        private HttpResponseMessage CreateCalendar(JsonObject body)
        {
            var id = $"calendar-{Guid.NewGuid():N}@group.calendar.google.com";
            Calendars[id] = new FakeCalendar(body["summary"]!.GetValue<string>(), body["timeZone"]!.GetValue<string>());
            return Json(HttpStatusCode.OK, new { id });
        }

        private static HttpResponseMessage Store(FakeCalendar calendar, string eventId, JsonObject body)
        {
            calendar.Events[eventId] = body;
            return Json(HttpStatusCode.OK, new { id = eventId });
        }

        private static HttpResponseMessage Status(HttpStatusCode status) => new(status);

        private static HttpResponseMessage Json(HttpStatusCode status, object body) =>
            new(status) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };
    }
}
