using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CoParent.Modules.Memories.Contracts;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using SkiaSharp;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// One-way exports of Family Memories photos to parents' Google Photos (#404). Google is never called: a fake answers
/// for its OAuth and Photos Library APIs, keeps the albums it was asked to make and records every request. Photos are
/// generated in the test; the Rivera Family is synthetic. Storage is Azurite.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class GooglePhotosExportTests(ApiFactory api) : IAsyncLifetime
{
    private const string ClientId = "test-photos-client.apps.googleusercontent.com";
    private const string ClientSecret = "test-photos-client-secret";
    private const string Scope = "https://www.googleapis.com/auth/photoslibrary.appendonly";

    private DateTimeOffset _start;
    private DateTimeOffset _during;

    public async ValueTask InitializeAsync()
    {
        await api.ResetDatabaseAsync();
        var now = api.Clock.GetUtcNow();
        _start = new DateTimeOffset(now.Year, now.Month, now.Day, now.Hour, 0, 0, TimeSpan.Zero).AddDays(2);
        _during = _start.AddHours(1);
    }

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
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));

        var status = await JsonAsync(await f.Dad.GetAsync(f.Path("memories/google-photos")));
        var memory = await JsonAsync(await f.Dad.GetAsync(Exports(f, eventId)));
        var authorize = await f.Dad.PostAsync(f.Path("memories/google-photos/authorize"));
        var export = await f.Dad.PostAsync(Exports(f, eventId), new { });

        Assert.False(status.GetProperty("available").GetBoolean());
        Assert.Equal("NotConnected", status.GetProperty("state").GetString());
        Assert.False(memory.GetProperty("available").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, authorize.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, export.StatusCode);
        Assert.Equal(0, await ExportPassAsync(host));
        Assert.Empty(google.Requests);
    }

    [Fact]
    public async Task Connecting_asks_only_for_the_append_only_scope_and_returns_to_the_memory()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);

        var url = new Uri((await JsonAsync(await f.Dad.PostAsync(f.Path("memories/google-photos/authorize"), new { returnEventId = eventId })))
            .GetProperty("url").GetString()!);
        var query = QueryHelpers.ParseQuery(url.Query);
        google.ExpectedChallenge = query["code_challenge"].ToString();
        var connected = await f.Dad.PostAsync(f.Path("memories/google-photos/connect"), new { code = FakeGoogle.GoodCode, state = query["state"].ToString() });
        var view = await JsonAsync(connected);

        Assert.Equal("https://accounts.google.com/o/oauth2/v2/auth", url.GetLeftPart(UriPartial.Path));
        Assert.Equal(Scope, query["scope"].ToString());
        Assert.Equal(ClientId, query["client_id"].ToString());
        Assert.Equal($"{ApiFactory.PublicBaseUrl}/settings/google-photos", query["redirect_uri"].ToString());
        Assert.Equal("S256", query["code_challenge_method"].ToString());
        Assert.Equal(HttpStatusCode.OK, connected.StatusCode);
        Assert.Equal("Connected", view.GetProperty("state").GetString());
        Assert.Equal(eventId, view.GetProperty("returnEventId").GetGuid());

        // The refresh token is stored encrypted and never sent back to the browser. Mom is unaffected.
        Assert.DoesNotContain(FakeGoogle.RefreshTokenFor(1), view.GetRawText(), StringComparison.Ordinal);
        var stored = await api.QueryScalarAsync<string>("SELECT protected_refresh_token FROM memories.google_photos_connections");
        Assert.NotNull(stored);
        Assert.DoesNotContain(FakeGoogle.RefreshTokenFor(1), stored, StringComparison.Ordinal);
        Assert.Equal("NotConnected", (await JsonAsync(await f.Mom.GetAsync(f.Path("memories/google-photos")))).GetProperty("state").GetString());
        Assert.Empty(google.Albums);
    }

    [Fact]
    public async Task Exporting_a_memory_puts_its_photos_in_one_album_for_the_event_and_marks_them_only_when_Google_confirms()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Blue));
        await ConnectAsync(f.Dad, f, google);

        var before = await JsonAsync(await f.Dad.GetAsync(Exports(f, eventId)));
        var queued = await ExportAsync(f.Dad, f, eventId);

        Assert.Equal(2, before.GetProperty("exportable").GetInt32());
        Assert.StartsWith("Soccer final · ", before.GetProperty("albumTitle").GetString(), StringComparison.Ordinal);
        Assert.Equal(2, queued.GetProperty("waiting").GetInt32());
        Assert.All(queued.GetProperty("photos").EnumerateArray(), p => Assert.Equal("Queued", p.GetProperty("state").GetString()));
        Assert.Empty(google.Albums);

        Assert.Equal(2, await ExportPassAsync(host));

        var album = Assert.Single(google.Albums.Values);
        Assert.StartsWith("Soccer final · ", album.Title, StringComparison.Ordinal);
        Assert.Equal(2, album.Items.Count);
        var after = await JsonAsync(await f.Dad.GetAsync(Exports(f, eventId)));
        Assert.Equal(2, after.GetProperty("exported").GetInt32());
        Assert.Equal(0, after.GetProperty("exportable").GetInt32());
        Assert.All(after.GetProperty("photos").EnumerateArray(), p => Assert.Equal("Exported", p.GetProperty("state").GetString()));

        // Exporting again sends nothing (no re-export in M3); a new photo later goes to the same album.
        await ExportAsync(f.Dad, f, eventId);
        Assert.Equal(0, await ExportPassAsync(host));
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Green));
        await ExportAsync(f.Dad, f, eventId);
        Assert.Equal(1, await ExportPassAsync(host));
        Assert.Equal(3, Assert.Single(google.Albums.Values).Items.Count);
        Assert.Equal(3, google.Requests.Count(r => r.Url.EndsWith("/v1/uploads", StringComparison.Ordinal)));

        var settings = await JsonAsync(await f.Dad.GetAsync(f.Path("memories/google-photos")));
        Assert.Equal(3, settings.GetProperty("exportedCount").GetInt32());
        Assert.Equal(1, settings.GetProperty("albumCount").GetInt32());
    }

    [Fact]
    public async Task A_co_parent_exports_shared_photos_only_while_the_uploader_allows_downloads_and_never_private_ones()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        var shared = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        var privatePhoto = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Blue));
        await ShareAsync(f.Dad, f, shared.GetProperty("batchId").GetGuid(), true);
        await ConnectAsync(f.Mom, f, google);

        // Shared but downloads off: Mom sees one photo she can't export; Dad's private batch isn't counted at all.
        var off = await ExportAsync(f.Mom, f, eventId);
        Assert.Equal(0, off.GetProperty("exportable").GetInt32());
        Assert.Equal(1, off.GetProperty("omitted").GetInt32());
        Assert.Empty(off.GetProperty("photos").EnumerateArray());

        // Naming the private photo directly changes nothing.
        var named = await ExportAsync(f.Mom, f, eventId, [PhotoId(privatePhoto)]);
        Assert.Empty(named.GetProperty("photos").EnumerateArray());
        Assert.Equal(0, await ExportPassAsync(host));

        await AllowDownloadsAsync(f.Dad, f, true);
        var on = await ExportAsync(f.Mom, f, eventId);
        Assert.Equal(1, on.GetProperty("waiting").GetInt32());
        Assert.Equal(1, await ExportPassAsync(host));
        Assert.Single(Assert.Single(google.Albums.Values).Items);
    }

    [Fact]
    public async Task Turning_sharing_off_before_a_queued_photo_is_sent_skips_it()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        var uploaded = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        var batchId = uploaded.GetProperty("batchId").GetGuid();
        await ShareAsync(f.Dad, f, batchId, true);
        await AllowDownloadsAsync(f.Dad, f, true);
        await ConnectAsync(f.Mom, f, google);
        await ExportAsync(f.Mom, f, eventId);

        await ShareAsync(f.Dad, f, batchId, false);
        await ExportPassAsync(host);

        Assert.DoesNotContain(google.Requests, r => r.Url.Contains("photoslibrary", StringComparison.Ordinal));
        var photo = Assert.Single((await JsonAsync(await f.Mom.GetAsync(Exports(f, eventId)))).GetProperty("photos").EnumerateArray());
        Assert.Equal("Skipped", photo.GetProperty("state").GetString());
        Assert.Equal("NotAllowed", photo.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Downloads_turned_off_after_the_upload_but_before_the_album_step_keep_the_photo_out_of_Google()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        var uploaded = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ShareAsync(f.Dad, f, uploaded.GetProperty("batchId").GetGuid(), true);
        await AllowDownloadsAsync(f.Dad, f, true);
        await ConnectAsync(f.Mom, f, google);
        await ExportAsync(f.Mom, f, eventId);
        google.OnUpload = () => AllowDownloadsAsync(f.Dad, f, false);

        await ExportPassAsync(host);

        Assert.Single(google.Requests, r => r.Url.EndsWith("/v1/uploads", StringComparison.Ordinal));
        Assert.DoesNotContain(google.Requests, r => r.Url.EndsWith(":batchCreate", StringComparison.Ordinal));
        var photo = Assert.Single((await JsonAsync(await f.Mom.GetAsync(Exports(f, eventId)))).GetProperty("photos").EnumerateArray());
        Assert.Equal("Skipped", photo.GetProperty("state").GetString());
    }

    [Fact]
    public async Task A_timeout_is_checked_again_with_the_same_upload_and_never_shown_as_exported_meanwhile()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ConnectAsync(f.Dad, f, google);
        await ExportAsync(f.Dad, f, eventId);
        google.FailNextBatchCreates = 1;

        Assert.Equal(0, await ExportPassAsync(host));
        var checking = Assert.Single((await JsonAsync(await f.Dad.GetAsync(Exports(f, eventId)))).GetProperty("photos").EnumerateArray());
        Assert.Equal("Checking", checking.GetProperty("state").GetString());

        // Not due yet: nothing is sent.
        Assert.Equal(0, await ExportPassAsync(host));
        api.Clock.Advance(TimeSpan.FromMinutes(2));
        Assert.Equal(1, await ExportPassAsync(host));

        Assert.Single(google.Requests, r => r.Url.EndsWith("/v1/uploads", StringComparison.Ordinal));
        Assert.Single(Assert.Single(google.Albums.Values).Items);
    }

    [Fact]
    public async Task Each_photo_keeps_its_own_result_when_Google_creates_only_some()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        var red = Jpeg(SKColors.Red);
        await UploadAsync(f.Dad, f, eventId, red);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Blue));
        await ConnectAsync(f.Dad, f, google);
        await ExportAsync(f.Dad, f, eventId);
        google.StorageFullAfter = 1;

        Assert.Equal(1, await ExportPassAsync(host));

        var photos = (await JsonAsync(await f.Dad.GetAsync(Exports(f, eventId)))).GetProperty("photos").EnumerateArray().ToList();
        Assert.Single(photos, p => p.GetProperty("state").GetString() == "Exported");
        var full = Assert.Single(photos, p => p.GetProperty("state").GetString() == "Failed");
        Assert.Equal("StorageFull", full.GetProperty("reason").GetString());

        // The parent frees space and tries again: only the failed photo is sent.
        google.StorageFullAfter = null;
        var retried = await ExportAsync(f.Dad, f, eventId);
        Assert.Equal(1, retried.GetProperty("waiting").GetInt32());
        Assert.Equal(1, await ExportPassAsync(host));
        Assert.Equal(2, Assert.Single(google.Albums.Values).Items.Count);
    }

    [Fact]
    public async Task Revoked_access_pauses_exports_until_the_parent_reconnects()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ConnectAsync(f.Dad, f, google);
        await ExportAsync(f.Dad, f, eventId);
        google.RevokeEverything();
        api.Clock.Advance(TimeSpan.FromHours(2));

        Assert.Equal(0, await ExportPassAsync(host));
        var stopped = await JsonAsync(await f.Dad.GetAsync(f.Path("memories/google-photos")));
        var waiting = Assert.Single((await JsonAsync(await f.Dad.GetAsync(Exports(f, eventId)))).GetProperty("photos").EnumerateArray());

        Assert.Equal("NeedsReconnect", stopped.GetProperty("state").GetString());
        Assert.Equal("AccessRevoked", stopped.GetProperty("problem").GetString());
        Assert.Equal("Queued", waiting.GetProperty("state").GetString());
        Assert.Equal("Reconnect", waiting.GetProperty("reason").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await f.Dad.PostAsync(Exports(f, eventId), new { })).StatusCode);

        await ConnectAsync(f.Dad, f, google);
        Assert.Equal(1, await ExportPassAsync(host));
        Assert.Single(Assert.Single(google.Albums.Values).Items);
    }

    [Fact]
    public async Task An_album_deleted_in_Google_is_made_again()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ConnectAsync(f.Dad, f, google);
        await ExportAsync(f.Dad, f, eventId);
        await ExportPassAsync(host);
        google.Albums.Clear();

        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Blue));
        await ExportAsync(f.Dad, f, eventId);
        Assert.Equal(1, await ExportPassAsync(host));

        Assert.Single(Assert.Single(google.Albums.Values).Items);
    }

    [Fact]
    public async Task A_photo_that_expires_while_waiting_is_marked_expired_and_never_sent()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ConnectAsync(f.Dad, f, google);
        await ExportAsync(f.Dad, f, eventId);
        api.Clock.Advance(TimeSpan.FromDays(29));

        Assert.Equal(0, await ExportPassAsync(host));

        Assert.DoesNotContain(google.Requests, r => r.Url.Contains("photoslibrary", StringComparison.Ordinal));
        Assert.Equal("Failed|Expired", await api.QueryScalarAsync<string>("SELECT state || '|' || reason FROM memories.photo_exports"));
    }

    [Fact]
    public async Task Disconnecting_revokes_access_and_forgets_albums_and_exports_but_leaves_Google_alone()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ConnectAsync(f.Dad, f, google);
        await ExportAsync(f.Dad, f, eventId);
        await ExportPassAsync(host);

        var disconnected = await f.Dad.SendAsync(HttpMethod.Delete, f.Path("memories/google-photos"));

        Assert.Equal(HttpStatusCode.NoContent, disconnected.StatusCode);
        Assert.Contains(google.Requests, r => r.Url.EndsWith("/revoke", StringComparison.Ordinal));
        Assert.Single(Assert.Single(google.Albums.Values).Items);
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM memories.google_photos_connections"));
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM memories.google_photos_albums"));
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM memories.photo_exports"));
        Assert.Equal("NotConnected", (await JsonAsync(await f.Dad.GetAsync(f.Path("memories/google-photos")))).GetProperty("state").GetString());
    }

    [Fact]
    public async Task A_state_from_another_parent_or_a_tampered_state_is_refused()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var url = new Uri((await JsonAsync(await f.Dad.PostAsync(f.Path("memories/google-photos/authorize")))).GetProperty("url").GetString()!);
        var state = QueryHelpers.ParseQuery(url.Query)["state"].ToString();

        var asMom = await f.Mom.PostAsync(f.Path("memories/google-photos/connect"), new { code = FakeGoogle.GoodCode, state });
        var tampered = await f.Dad.PostAsync(f.Path("memories/google-photos/connect"), new { code = FakeGoogle.GoodCode, state = state[..^4] + "AAAA" });

        Assert.Equal(HttpStatusCode.BadRequest, asMom.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tampered.StatusCode);
        Assert.Empty(google.Requests);
    }

    [Fact]
    public async Task Declining_Photos_access_on_Googles_consent_page_connects_nothing()
    {
        var google = new FakeGoogle { GrantedScope = "openid" };
        using var host = Host(google);
        using var f = await FamilyAsync(host);

        var response = await TryConnectAsync(f.Dad, f, google);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains(google.Requests, r => r.Url.EndsWith("/revoke", StringComparison.Ordinal));
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM memories.google_photos_connections"));
    }

    [Fact]
    public async Task Only_signed_in_parents_of_the_family_can_connect_or_export()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var f = await FamilyAsync(host);
        var eventId = await ActivityAsync(f);
        using var stranger = await ApiSession.SignedInAsync(host);
        await stranger.CreateFamilyAsync("Another Family");
        using var anonymous = await ApiSession.StartAsync(host);

        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(f.Path("memories/google-photos"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(Exports(f, eventId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsync(Exports(f, eventId), new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync(f.Path("memories/google-photos/authorize"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.PostAsync(f.Path("memories/google-photos/authorize"), withAntiforgery: false)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.PostAsync(Exports(f, eventId), new { }, withAntiforgery: false)).StatusCode);
        Assert.Empty(google.Requests);
    }

    [Fact]
    public async Task A_parent_leaving_the_family_takes_their_connection_with_them()
    {
        var google = new FakeGoogle();
        using var host = Host(google);
        using var dad = await ApiSession.SignedInAsync(host);
        var familyId = await dad.CreateFamilyAsync();
        var url = new Uri((await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/memories/google-photos/authorize"))).GetProperty("url").GetString()!);
        var query = QueryHelpers.ParseQuery(url.Query);
        google.ExpectedChallenge = query["code_challenge"].ToString();
        Assert.Equal(
            HttpStatusCode.OK,
            (await dad.PostAsync($"/api/families/{familyId}/memories/google-photos/connect", new { code = FakeGoogle.GoodCode, state = query["state"].ToString() })).StatusCode);

        var deleted = await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password });

        Assert.True(deleted.IsSuccessStatusCode, $"Account deletion returned {deleted.StatusCode}");
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM memories.google_photos_connections"));
    }

    private WebApplicationFactory<Program> Host(FakeGoogle google, bool configured = true) =>
        api.WithWebHostBuilder(builder =>
        {
            if (configured)
            {
                builder.UseSetting("GooglePhotos:ClientId", ClientId);
                builder.UseSetting("GooglePhotos:ClientSecret", ClientSecret);
            }

            builder.UseSetting("GooglePhotos:BackgroundExport", "false");
            builder.ConfigureServices(services => services.Configure<HttpClientFactoryOptions>(
                "google-photos", options => options.HttpMessageHandlerBuilderActions.Add(b => b.PrimaryHandler = google)));
        });

    private static async Task<int> ExportPassAsync(WebApplicationFactory<Program> host) =>
        await host.Services.GetRequiredService<IGooglePhotosExport>().ExportAsync(TestContext.Current.CancellationToken);

    private static async Task ConnectAsync(ApiSession parent, TestFamily f, FakeGoogle google) =>
        Assert.Equal(HttpStatusCode.OK, (await TryConnectAsync(parent, f, google)).StatusCode);

    private static async Task<HttpResponseMessage> TryConnectAsync(ApiSession parent, TestFamily f, FakeGoogle google)
    {
        var url = new Uri((await JsonAsync(await parent.PostAsync(f.Path("memories/google-photos/authorize")))).GetProperty("url").GetString()!);
        var query = QueryHelpers.ParseQuery(url.Query);
        google.ExpectedChallenge = query["code_challenge"].ToString();
        return await parent.PostAsync(f.Path("memories/google-photos/connect"), new { code = FakeGoogle.GoodCode, state = query["state"].ToString() });
    }

    private static async Task<JsonElement> ExportAsync(ApiSession parent, TestFamily f, Guid eventId, Guid[]? photoIds = null)
    {
        var response = await parent.PostAsync(Exports(f, eventId), new { photoIds });
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        return await JsonAsync(response);
    }

    private static string Exports(TestFamily f, Guid eventId) => f.Path($"memories/events/{eventId}/google-photos");

    private static Guid PhotoId(JsonElement uploaded) => uploaded.GetProperty("photo").GetProperty("id").GetGuid();

    private async Task<Guid> ActivityAsync(TestFamily f)
    {
        var created = await f.Dad.PostAsync(f.Path("calendar/events"), new
        {
            category = "Activity",
            title = "Soccer final",
            startsAt = _start,
            endsAt = _start.AddHours(2),
            allDay = false,
            childIds = new[] { f.KaiId },
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        if (api.Clock.GetUtcNow() < _during)
        {
            api.Clock.SetUtcNow(_during);
        }

        return (await JsonAsync(created)).GetProperty("id").GetGuid();
    }

    private static async Task<JsonElement> UploadAsync(ApiSession parent, TestFamily f, Guid eventId, byte[] file)
    {
        var response = await parent.SendBytesAsync(HttpMethod.Post, f.Path($"memories/events/{eventId}/photos"), file);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        return await JsonAsync(response);
    }

    private static async Task ShareAsync(ApiSession parent, TestFamily f, Guid batchId, bool visible) =>
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await parent.SendAsync(HttpMethod.Patch, f.Path($"memories/batches/{batchId}"), new { visibleToCoParent = visible })).StatusCode);

    private static async Task AllowDownloadsAsync(ApiSession parent, TestFamily f, bool allow) =>
        Assert.Equal(
            HttpStatusCode.OK,
            (await parent.SendAsync(HttpMethod.Put, f.Path("memories/settings"), new { allowCoParentDownload = allow })).StatusCode);

    private static byte[] Jpeg(SKColor colour)
    {
        using var bitmap = new SKBitmap(640, 480);
        bitmap.Erase(colour);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 90);
        return data.ToArray();
    }

    /// <summary>Dad and Mom, and Kai approved by both.</summary>
    private static async Task<TestFamily> FamilyAsync(WebApplicationFactory<Program> host)
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(host, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(host, displayName: "Mom", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        await mom.PostAsync($"/api/families/{familyId}/approvals/{kai.GetProperty("changeRequestId").GetGuid()}/approve");
        return new TestFamily(dad, mom, familyId, kai.GetProperty("id").GetGuid());
    }

    private sealed record TestFamily(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId) : IDisposable
    {
        public string Path(string rest) => $"/api/families/{FamilyId}/{rest}";

        public void Dispose()
        {
            Dad.Dispose();
            Mom.Dispose();
        }
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

    private sealed record SentRequest(HttpMethod Method, string Url);

    private sealed class FakeAlbum(string title)
    {
        public string Title { get; } = title;

        public ConcurrentDictionary<string, string> Items { get; } = new();
    }

    /// <summary>
    /// Stands in for Google's OAuth and Photos Library APIs, keeping albums in memory. Like Google, the same bytes make
    /// the same media item.
    /// </summary>
    private sealed class FakeGoogle : HttpMessageHandler
    {
        public const string GoodCode = "good-code";
        private readonly ConcurrentQueue<SentRequest> _requests = new();
        private readonly ConcurrentDictionary<string, bool> _validAccess = new();
        private readonly ConcurrentDictionary<string, bool> _validRefresh = new();
        private readonly ConcurrentDictionary<string, string> _uploads = new();
        private int _issued;

        public IReadOnlyList<SentRequest> Requests => [.. _requests];

        public ConcurrentDictionary<string, FakeAlbum> Albums { get; } = new();

        public string? ExpectedChallenge { get; set; }

        public string GrantedScope { get; init; } = Scope;

        /// <summary>Runs after Google accepts an upload, to change something before the album step.</summary>
        public Func<Task>? OnUpload { get; set; }

        /// <summary>The next this many batchCreate calls answer 503 after doing nothing.</summary>
        public int FailNextBatchCreates { get; set; }

        /// <summary>When set, items after this many in one batchCreate fail with RESOURCE_EXHAUSTED.</summary>
        public int? StorageFullAfter { get; set; }

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

            if (url.Host == "oauth2.googleapis.com")
            {
                var form = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(cancellationToken));
                if (url.AbsolutePath == "/token")
                {
                    return Token(form);
                }

                var revoked = form["token"].ToString();
                _validRefresh.TryRemove(revoked, out _);
                _validAccess.TryRemove(revoked, out _);
                return new HttpResponseMessage(HttpStatusCode.OK);
            }

            if (request.Headers.Authorization?.Parameter is not { } bearer || !_validAccess.ContainsKey(bearer))
            {
                return new HttpResponseMessage(HttpStatusCode.Unauthorized);
            }

            switch (url.AbsolutePath)
            {
                case "/v1/uploads":
                    {
                        Assert.Equal("raw", request.Headers.GetValues("X-Goog-Upload-Protocol").Single());
                        var bytes = await request.Content!.ReadAsByteArrayAsync(cancellationToken);
                        var token = $"upload-{Guid.NewGuid():N}";
                        _uploads[token] = Convert.ToHexString(SHA256.HashData(bytes));
                        if (OnUpload is { } onUpload)
                        {
                            await onUpload();
                        }

                        return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(token) };
                    }

                case "/v1/albums":
                    {
                        var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!;
                        var id = $"album-{Guid.NewGuid():N}";
                        Albums[id] = new FakeAlbum(body["album"]!["title"]!.GetValue<string>());
                        return Json(HttpStatusCode.OK, new { id });
                    }

                case "/v1/mediaItems:batchCreate":
                    return await BatchCreateAsync(request, cancellationToken);

                default:
                    return new HttpResponseMessage(HttpStatusCode.NotFound);
            }
        }

        private async Task<HttpResponseMessage> BatchCreateAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (FailNextBatchCreates > 0)
            {
                FailNextBatchCreates--;
                return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
            }

            var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!;
            if (!Albums.TryGetValue(body["albumId"]!.GetValue<string>(), out var album))
            {
                return Json(HttpStatusCode.BadRequest, new { error = new { code = 400, status = "INVALID_ARGUMENT" } });
            }

            var results = new List<object>();
            var n = 0;
            var anyFailed = false;
            foreach (var item in body["newMediaItems"]!.AsArray())
            {
                var token = item!["simpleMediaItem"]!["uploadToken"]!.GetValue<string>();
                if (StorageFullAfter is { } limit && n++ >= limit)
                {
                    anyFailed = true;
                    results.Add(new { uploadToken = token, status = new { code = 8, message = "Storage full" } });
                }
                else if (_uploads.TryGetValue(token, out var hash))
                {
                    var mediaId = $"media-{hash[..16]}";
                    album.Items[mediaId] = item["simpleMediaItem"]!["fileName"]!.GetValue<string>();
                    results.Add(new { uploadToken = token, status = new { message = "Success" }, mediaItem = new { id = mediaId } });
                }
                else
                {
                    anyFailed = true;
                    results.Add(new { uploadToken = token, status = new { code = 3, message = "Invalid upload token" } });
                }
            }

            return Json(anyFailed ? HttpStatusCode.MultiStatus : HttpStatusCode.OK, new { newMediaItemResults = results });
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

        private static HttpResponseMessage Json(HttpStatusCode status, object body) =>
            new(status) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };
    }
}
