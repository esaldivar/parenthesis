using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CoParent.Modules.Memories.Contracts;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using SkiaSharp;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Event photos and Family Memories (#403), with two parents, a child, a shared kitchen device and a separate household.
/// Photos are generated in the test; names are synthetic. Storage is Azurite.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class EventPhotoTests(ApiFactory api) : IAsyncLifetime
{
    private const string KaisPin = "2580";
    private const string DadsPin = "583920";

    // The soccer final starts on the next whole hour two days from now and lasts two hours. Tests run "now" an hour
    // after it starts. The clock only ever moves forward: sign-in cookies and data-protection keys are issued at real time.
    private DateTimeOffset _start;
    private DateTimeOffset _during;
    private Guid _kaiId;

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
    public async Task A_new_batch_is_private_to_its_uploader_until_they_share_it()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);

        var uploaded = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        var photo = uploaded.GetProperty("photo");
        var urls = new[] { Url(photo, "url"), Url(photo, "thumbnailUrl"), Url(photo, "downloadUrl") };

        var dads = await EventAsync(f.Dad, f, eventId);
        var batch = dads.GetProperty("batches").EnumerateArray().Single();
        Assert.True(batch.GetProperty("yours").GetBoolean());
        Assert.False(batch.GetProperty("visibleToCoParent").GetBoolean());
        foreach (var url in urls)
        {
            Assert.Equal(HttpStatusCode.OK, (await f.Dad.GetAsync(url)).StatusCode);
        }

        // Mom sees the event but nothing of Dad's: no batch, no count, no memory, no file.
        var moms = await EventAsync(f.Mom, f, eventId);
        Assert.Empty(moms.GetProperty("batches").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, moms.GetProperty("photosDeletedOn").ValueKind);
        Assert.Empty((await JsonAsync(await f.Mom.GetAsync(f.Path("memories")))).EnumerateArray());
        foreach (var url in urls)
        {
            Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync(url)).StatusCode);
        }

        // Mom can't share it for him, or delete it.
        var batchId = batch.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.SendAsync(HttpMethod.Patch, f.Path($"memories/batches/{batchId}"), new { visibleToCoParent = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.SendAsync(HttpMethod.Delete, f.Path($"memories/photos/{photo.GetProperty("id").GetGuid()}"))).StatusCode);
        Assert.Empty((await EventAsync(f.Mom, f, eventId)).GetProperty("batches").EnumerateArray());

        // Dad shares it: Mom can view it but not download it, because Dad hasn't allowed downloads.
        await ShareAsync(f.Dad, f, batchId, true);
        var shared = (await EventAsync(f.Mom, f, eventId)).GetProperty("batches").EnumerateArray().Single();
        Assert.False(shared.GetProperty("yours").GetBoolean());
        Assert.False(shared.GetProperty("downloadsAllowed").GetBoolean());
        Assert.Equal(JsonValueKind.Null, shared.GetProperty("photos")[0].GetProperty("downloadUrl").ValueKind);
        Assert.Equal(HttpStatusCode.OK, (await f.Mom.GetAsync(urls[0])).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Mom.GetAsync(urls[1])).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync(urls[2])).StatusCode);
        var memory = (await JsonAsync(await f.Mom.GetAsync(f.Path("memories")))).EnumerateArray().Single();
        Assert.Equal(1, memory.GetProperty("sharedWithYouCount").GetInt32());
        Assert.Equal(0, memory.GetProperty("yourPhotoCount").GetInt32());

        // Turning sharing off applies to Mom's very next request.
        await ShareAsync(f.Dad, f, batchId, false);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync(urls[0])).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync(urls[1])).StatusCode);
        Assert.Empty((await EventAsync(f.Mom, f, eventId)).GetProperty("batches").EnumerateArray());
        Assert.Equal(HttpStatusCode.OK, (await f.Dad.GetAsync(urls[2])).StatusCode);
    }

    [Fact]
    public async Task Each_parent_controls_only_their_own_download_permission_and_sharing_alone_never_grants_it()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        var dads = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        var moms = await UploadAsync(f.Mom, f, eventId, Jpeg(SKColors.Blue));
        await ShareAsync(f.Dad, f, dads.GetProperty("batchId").GetGuid(), true);
        await ShareAsync(f.Mom, f, moms.GetProperty("batchId").GetGuid(), true);
        var dadsDownload = Url(dads.GetProperty("photo"), "downloadUrl");
        var momsDownload = Url(moms.GetProperty("photo"), "downloadUrl");

        // Off by default for each parent; each still downloads their own.
        foreach (var parent in new[] { f.Dad, f.Mom })
        {
            Assert.False((await JsonAsync(await parent.GetAsync(f.Path("memories/settings")))).GetProperty("allowCoParentDownload").GetBoolean());
        }

        Assert.Equal(HttpStatusCode.OK, (await f.Dad.GetAsync(dadsDownload)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync(dadsDownload)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync(momsDownload)).StatusCode);

        // Dad allows downloads of his photos. Mom's setting is unchanged, so Dad still can't download hers.
        var saved = await f.Dad.SendAsync(HttpMethod.Put, f.Path("memories/settings"), new { allowCoParentDownload = true });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.False((await JsonAsync(await f.Mom.GetAsync(f.Path("memories/settings")))).GetProperty("allowCoParentDownload").GetBoolean());
        var download = await f.Mom.GetAsync(dadsDownload);
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition?.DispositionType);
        Assert.StartsWith($"{_start.UtcDateTime:yyyy-MM-dd} Soccer final 01 ", download.Content.Headers.ContentDisposition?.FileNameStar ?? download.Content.Headers.ContentDisposition?.FileName?.Trim('"'), StringComparison.Ordinal);
        Assert.True(download.Headers.CacheControl?.NoStore);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync(momsDownload)).StatusCode);
        var momsView = (await EventAsync(f.Mom, f, eventId)).GetProperty("batches").EnumerateArray().Single(b => !b.GetProperty("yours").GetBoolean());
        Assert.True(momsView.GetProperty("downloadsAllowed").GetBoolean());

        // Turning it off keeps viewing and stops new downloads at once.
        await f.Dad.SendAsync(HttpMethod.Put, f.Path("memories/settings"), new { allowCoParentDownload = false });
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync(dadsDownload)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Mom.GetAsync(Url(dads.GetProperty("photo"), "url"))).StatusCode);

        // A private batch stays private whatever the download setting says.
        await f.Dad.SendAsync(HttpMethod.Put, f.Path("memories/settings"), new { allowCoParentDownload = true });
        await ShareAsync(f.Dad, f, dads.GetProperty("batchId").GetGuid(), false);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync(dadsDownload)).StatusCode);
    }

    [Fact]
    public async Task Children_other_families_and_guessed_ids_get_nothing()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        var uploaded = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ShareAsync(f.Dad, f, uploaded.GetProperty("batchId").GetGuid(), true);
        await f.Dad.SendAsync(HttpMethod.Put, f.Path("memories/settings"), new { allowCoParentDownload = true });
        var photo = uploaded.GetProperty("photo");

        // Kai, signed in on the kitchen iPad: children can't see or add event photos in M3 (#179 is M5).
        using var kitchen = await ApiSession.StartAsync(api);
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.LoginAsync(f.DadEmail)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await kitchen.PostAsync(f.Path("devices/household"), new { name = "Kitchen iPad", pin = DadsPin })).StatusCode);
        await kitchen.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.PostAsync("/api/device/switch")).StatusCode);
        await kitchen.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.PostAsync("/api/device/child-session", new { childId = f.KaiId, pin = KaisPin })).StatusCode);
        await kitchen.RefreshAntiforgeryAsync();
        foreach (var url in new[] { f.Path("memories"), f.Path($"memories/events/{eventId}"), Url(photo, "url"), Url(photo, "thumbnailUrl"), Url(photo, "downloadUrl"), f.Path("memories/settings") })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.GetAsync(url)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.SendBytesAsync(HttpMethod.Post, f.Path($"memories/events/{eventId}/photos"), Jpeg(SKColors.Green))).StatusCode);

        // Another family's parent, even with the exact URLs.
        using var other = await ApiSession.SignedInAsync(api, displayName: "Sam");
        var otherFamily = await other.CreateFamilyAsync("Okafor Family");
        foreach (var url in new[] { Url(photo, "url"), Url(photo, "thumbnailUrl"), Url(photo, "downloadUrl") })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(url)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(url.Replace(f.FamilyId.ToString(), otherFamily.ToString(), StringComparison.Ordinal))).StatusCode);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/families/{otherFamily}/memories/events/{eventId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync(f.Path($"memories/photos/{Guid.CreateVersion7()}"))).StatusCode);
    }

    [Fact]
    public async Task Only_confirmed_events_take_photos_and_parenting_time_only_from_its_caregiver()
    {
        using var f = await FamilyAsync();
        api.Clock.SetUtcNow(_during);

        // A joint event waits for Mom's approval: no photos until it's confirmed.
        var joint = await JsonAsync(await f.Dad.PostAsync(f.Path("calendar/events"), Event("Joint", "School play")));
        var jointId = joint.GetProperty("id").GetGuid();
        await AssertRefusedAsync(f.Dad, f, jointId, HttpStatusCode.Conflict, "not-confirmed");
        Assert.Equal("not-confirmed", (await EventAsync(f.Dad, f, jointId)).GetProperty("uploads").GetProperty("blocked").GetString());
        await ApproveAsync(f, joint);
        var shared = (await EventAsync(f.Dad, f, jointId)).GetProperty("uploads");
        Assert.Equal(JsonValueKind.Null, shared.GetProperty("blocked").ValueKind);
        Assert.Equal(10, shared.GetProperty("cap").GetInt32());

        // Dad's parenting time: only Dad, with all 20 spots.
        var parenting = await JsonAsync(await f.Dad.PostAsync(f.Path("calendar/events"), Event("ParentingTime", "Weekend with Dad", f.DadMembershipId)));
        await ApproveAsync(f, parenting);
        var parentingId = parenting.GetProperty("id").GetGuid();
        await AssertRefusedAsync(f.Mom, f, parentingId, HttpStatusCode.Conflict, "not-caregiver");
        var dadsUploads = (await EventAsync(f.Dad, f, parentingId)).GetProperty("uploads");
        Assert.Equal(20, dadsUploads.GetProperty("cap").GetInt32());
        Assert.Equal(0, (await EventAsync(f.Mom, f, parentingId)).GetProperty("uploads").GetProperty("cap").GetInt32());
        await UploadAsync(f.Dad, f, parentingId, Jpeg(SKColors.Red));

        // Unavailable time never takes photos and isn't a memory.
        var unavailable = await JsonAsync(await f.Dad.PostAsync(f.Path("calendar/events"), new { category = "Unavailable", startsAt = _start.AddDays(3), endsAt = _start.AddDays(3).AddHours(2) }));
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync(f.Path($"memories/events/{unavailable.GetProperty("id").GetGuid()}"))).StatusCode);
    }

    [Fact]
    public async Task Uploads_open_at_the_start_and_close_28_days_after_the_end()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);

        api.Clock.SetUtcNow(_start.AddMinutes(-5));
        await AssertRefusedAsync(f.Dad, f, eventId, HttpStatusCode.Conflict, "not-started");

        api.Clock.SetUtcNow(_start.AddHours(2).AddDays(28).AddMinutes(-5));
        await f.SignInAgainAsync(api);
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));

        api.Clock.SetUtcNow(_start.AddHours(2).AddDays(28).AddMinutes(5));
        await AssertRefusedAsync(f.Dad, f, eventId, HttpStatusCode.Conflict, "window-closed");
    }

    [Fact]
    public async Task On_a_shared_event_each_parent_has_10_reserved_spots_and_a_batch_holds_5()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);

        var first = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        var batchId = first.GetProperty("batchId").GetGuid();
        for (var i = 2; i <= 5; i++)
        {
            var next = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red), batchId);
            Assert.Equal(batchId, next.GetProperty("batchId").GetGuid());
            Assert.Equal(i, next.GetProperty("photo").GetProperty("position").GetInt32());
        }

        await AssertRefusedAsync(f.Dad, f, eventId, HttpStatusCode.Conflict, "batch-full", batchId);

        // Another batch fills Dad's 10; the 11th is refused, and Mom's 10 are untouched.
        var second = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        for (var i = 2; i <= 5; i++)
        {
            await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red), second.GetProperty("batchId").GetGuid());
        }

        await AssertRefusedAsync(f.Dad, f, eventId, HttpStatusCode.Conflict, "event-full");
        var dads = (await EventAsync(f.Dad, f, eventId)).GetProperty("uploads");
        Assert.Equal(10, dads.GetProperty("used").GetInt32());
        Assert.Equal(0, dads.GetProperty("remaining").GetInt32());
        var moms = (await EventAsync(f.Mom, f, eventId)).GetProperty("uploads");
        Assert.Equal(10, moms.GetProperty("remaining").GetInt32());
        await UploadAsync(f.Mom, f, eventId, Jpeg(SKColors.Blue));

        // Deleting one of Dad's frees its spot at once.
        await DeleteAsync(f.Dad, f, first.GetProperty("photo").GetProperty("id").GetGuid());
        await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await AssertRefusedAsync(f.Dad, f, eventId, HttpStatusCode.Conflict, "event-full");

        // A batch closes 30 minutes after it started, and only its uploader can add to it.
        await AssertRefusedAsync(f.Mom, f, eventId, HttpStatusCode.NotFound, null, batchId);
        api.Clock.SetUtcNow(_during.AddMinutes(31));
        var momsBatch = (await EventAsync(f.Mom, f, eventId)).GetProperty("batches").EnumerateArray().Single(b => b.GetProperty("yours").GetBoolean());
        await AssertRefusedAsync(f.Mom, f, eventId, HttpStatusCode.Conflict, "batch-closed", momsBatch.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Parallel_uploads_cannot_take_more_than_the_remaining_spots()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        for (var i = 0; i < 8; i++)
        {
            await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        }

        // Two spots left; six uploads race for them.
        var photo = Jpeg(SKColors.Green);
        var responses = await Task.WhenAll(Enumerable.Range(0, 6)
            .Select(_ => f.Dad.SendBytesAsync(HttpMethod.Post, f.Path($"memories/events/{eventId}/photos"), photo)));

        Assert.Equal(2, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(4, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
        Assert.Equal(10L, await api.QueryScalarAsync<long>(
            "SELECT count(*) FROM memories.event_photos WHERE uploader_membership_id = @m AND state = 'Active'", ("m", f.DadMembershipId)));
    }

    [Fact]
    public async Task Each_parent_has_their_own_250_MB_counted_from_stored_photos_and_thumbnails()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        var uploaded = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        var stored = await api.QueryScalarAsync<long>(
            "SELECT photo_bytes + thumbnail_bytes FROM memories.event_photos WHERE id = @id", ("id", uploaded.GetProperty("photo").GetProperty("id").GetGuid()));
        var settings = await JsonAsync(await f.Dad.GetAsync(f.Path("memories/settings")));
        Assert.Equal(stored, settings.GetProperty("storageUsedBytes").GetInt64());
        Assert.Equal(250_000_000L, settings.GetProperty("storageLimitBytes").GetInt64());

        // Fill Dad's allowance to within a few bytes with older photos (on another event, so spots aren't the limit).
        var otherEvent = await ActivityAsync(f, "Practice");
        await FillStorageAsync(f, otherEvent, f.DadMembershipId, 250_000_000L - stored - 10);
        await AssertRefusedAsync(f.Dad, f, eventId, HttpStatusCode.Conflict, "storage-full");
        Assert.Equal(250_000_000L - 10, (await JsonAsync(await f.Dad.GetAsync(f.Path("memories/settings")))).GetProperty("storageUsedBytes").GetInt64());

        // Mom's allowance is her own; nothing of Dad's was deleted or shortened.
        await UploadAsync(f.Mom, f, eventId, Jpeg(SKColors.Blue));
        Assert.Equal(HttpStatusCode.OK, (await f.Dad.GetAsync(Url(uploaded.GetProperty("photo"), "url"))).StatusCode);
    }

    [Theory]
    [InlineData("heic", HttpStatusCode.UnsupportedMediaType)]
    [InlineData("raw", HttpStatusCode.UnsupportedMediaType)]
    [InlineData("unsupported", HttpStatusCode.UnsupportedMediaType)]
    [InlineData("empty", HttpStatusCode.BadRequest)]
    [InlineData("too-large", HttpStatusCode.RequestEntityTooLarge)]
    public async Task Unsupported_and_oversized_files_are_refused_with_a_reason_and_take_nothing(string reason, HttpStatusCode status)
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        byte[] file = reason switch
        {
            // An iPhone HEIC header, a DNG (TIFF) header, a GIF and nothing at all.
            "heic" => [0, 0, 0, 24, .. "ftypheic"u8, 0, 0, 0, 0, .. "mif1heic"u8, .. new byte[64]],
            "raw" => [.. "II*\0"u8, 8, 0, 0, 0, .. new byte[64]],
            "unsupported" => [.. "GIF89a"u8, 1, 0, 1, 0, 0, 0, 0, .. new byte[32]],
            "empty" => [],
            _ => new byte[20_000_001],
        };

        var response = await f.Dad.SendBytesAsync(HttpMethod.Post, f.Path($"memories/events/{eventId}/photos"), file);

        Assert.Equal(status, response.StatusCode);
        Assert.Equal(reason, (await JsonAsync(response)).GetProperty("reason").GetString());
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM memories.event_photos"));
    }

    [Fact]
    public async Task A_20_MB_source_is_accepted()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);

        // A real JPEG padded with a comment segment to exactly 20,000,000 bytes.
        var jpeg = Jpeg(SKColors.Red);
        var padding = 20_000_000 - jpeg.Length;
        var padded = new List<byte>(20_000_000) { jpeg[0], jpeg[1] };
        while (padding > 0)
        {
            var size = Math.Min(65_533, padding - 4);
            if (padding - (size + 4) is > 0 and < 4)
            {
                size -= 4;
            }

            padded.AddRange([0xFF, 0xFE, (byte)((size + 2) >> 8), (byte)(size + 2)]);
            padded.AddRange(new byte[size]);
            padding -= size + 4;
        }

        padded.AddRange(jpeg[2..]);
        Assert.Equal(20_000_000, padded.Count);

        await UploadAsync(f.Dad, f, eventId, [.. padded]);
    }

    [Fact]
    public async Task Stored_photos_are_upright_capped_at_2560_pixels_with_a_480_pixel_thumbnail_and_no_metadata()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);

        // A 3000x2000 JPEG taken with the camera turned (EXIF orientation 6), red on the left, carrying a stand-in for location.
        var upload = TestImages.WithExif(TestImages.HalvesJpeg(3000, 2000), orientation: 6, description: "SYNTHETIC-GPS 41.88N 87.62W");
        var photo = (await UploadAsync(f.Dad, f, eventId, upload)).GetProperty("photo");
        Assert.Equal(1707, photo.GetProperty("width").GetInt32());
        Assert.Equal(2560, photo.GetProperty("height").GetInt32());

        var response = await f.Dad.GetAsync(Url(photo, "url"));
        var bytes = await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
        Assert.Equal("image/webp", response.Content.Headers.ContentType?.MediaType);
        Assert.True(response.Headers.CacheControl is { Private: true, NoCache: true });
        Assert.True(bytes.Length <= 5_000_000);
        Assert.Equal(-1, bytes.AsSpan().IndexOf("SYNTHETIC-GPS"u8));
        Assert.Equal(-1, bytes.AsSpan().IndexOf("Exif"u8));
        using (var bitmap = SKBitmap.Decode(bytes))
        {
            Assert.Equal((1707, 2560), (bitmap.Width, bitmap.Height));
            Assert.True(IsClose(bitmap.GetPixel(850, 40), SKColors.Red)); // the camera's left is now the top
            Assert.True(IsClose(bitmap.GetPixel(850, 2520), SKColors.Blue));
        }

        using (var thumbnail = SKBitmap.Decode(await f.Dad.Client.GetByteArrayAsync(Url(photo, "thumbnailUrl"), TestContext.Current.CancellationToken)))
        {
            Assert.Equal((320, 480), (thumbnail.Width, thumbnail.Height));
        }

        // Revalidation answers 304 without sending the photo again.
        var again = new HttpRequestMessage(HttpMethod.Get, Url(photo, "url"));
        again.Headers.IfNoneMatch.Add(response.Headers.ETag!);
        Assert.Equal(HttpStatusCode.NotModified, (await f.Dad.Client.SendAsync(again, TestContext.Current.CancellationToken)).StatusCode);

        // Small photos are never enlarged.
        var small = (await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red))).GetProperty("photo");
        Assert.Equal((640, 480), (small.GetProperty("width").GetInt32(), small.GetProperty("height").GetInt32()));
    }

    [Fact]
    public async Task Photos_expire_28_days_after_upload_and_the_cleanup_frees_their_files_spots_and_storage()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        var uploaded = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ShareAsync(f.Dad, f, uploaded.GetProperty("batchId").GetGuid(), true);
        var photo = uploaded.GetProperty("photo");
        var expires = photo.GetProperty("expiresAt").GetDateTimeOffset();
        Assert.InRange(expires, _during.AddDays(28), _during.AddDays(28).AddSeconds(30));

        // Day 20 and day 27: still there for both parents.
        foreach (var day in new[] { 20, 27 })
        {
            api.Clock.SetUtcNow(_during.AddDays(day));
            await f.SignInAgainAsync(api);
            Assert.Equal(HttpStatusCode.OK, (await f.Mom.GetAsync(Url(photo, "url"))).StatusCode);
        }

        // Day 28: gone at once for everyone, before any cleanup.
        api.Clock.SetUtcNow(_during.AddDays(28).AddMinutes(1));
        await f.SignInAgainAsync(api);
        foreach (var url in new[] { Url(photo, "url"), Url(photo, "thumbnailUrl"), Url(photo, "downloadUrl") })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync(url)).StatusCode);
        }

        Assert.Empty((await JsonAsync(await f.Dad.GetAsync(f.Path("memories")))).EnumerateArray());
        Assert.Equal(0L, (await JsonAsync(await f.Dad.GetAsync(f.Path("memories/settings")))).GetProperty("storageUsedBytes").GetInt64());

        // The cleanup removes the files; the event stays and says when its photos were deleted.
        var cleanup = api.Services.GetRequiredService<IEventPhotoCleanup>();
        Assert.Equal(1, await cleanup.CleanUpAsync(TestContext.Current.CancellationToken));
        Assert.Equal(0, await cleanup.CleanUpAsync(TestContext.Current.CancellationToken));
        Assert.Equal("Expired", await api.QueryScalarAsync<string>("SELECT state FROM memories.event_photos"));
        foreach (var parent in new[] { f.Dad, f.Mom })
        {
            var view = await EventAsync(parent, f, eventId);
            Assert.Empty(view.GetProperty("batches").EnumerateArray());
            Assert.InRange(view.GetProperty("photosDeletedOn").GetDateTimeOffset() - expires, TimeSpan.FromMilliseconds(-1), TimeSpan.FromMilliseconds(1));
        }

        Assert.Equal(HttpStatusCode.OK, (await f.Dad.GetAsync(f.Path($"calendar/events/{eventId}"))).StatusCode);
    }

    [Fact]
    public async Task A_deleted_photo_is_gone_for_both_parents_and_its_files_are_cleaned_up()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        var uploaded = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await ShareAsync(f.Dad, f, uploaded.GetProperty("batchId").GetGuid(), true);
        var photo = uploaded.GetProperty("photo");

        await DeleteAsync(f.Dad, f, photo.GetProperty("id").GetGuid());

        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync(Url(photo, "url"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync(Url(photo, "url"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.SendAsync(HttpMethod.Delete, f.Path($"memories/photos/{photo.GetProperty("id").GetGuid()}"))).StatusCode);
        Assert.Equal(1, await api.Services.GetRequiredService<IEventPhotoCleanup>().CleanUpAsync(TestContext.Current.CancellationToken));
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM memories.event_photos"));
        Assert.Equal(0L, await api.QueryScalarAsync<long>("SELECT count(*) FROM memories.photo_batches"));
    }

    [Fact]
    public async Task An_abandoned_upload_gives_its_spot_back_after_15_minutes()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        var batch = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        await api.QueryScalarAsync<object>(
            "UPDATE memories.event_photos SET state = 'Uploading' WHERE id = @id", ("id", batch.GetProperty("photo").GetProperty("id").GetGuid()));
        var cleanup = api.Services.GetRequiredService<IEventPhotoCleanup>();

        Assert.Equal(0, await cleanup.CleanUpAsync(TestContext.Current.CancellationToken));
        Assert.Equal(1, (await EventAsync(f.Dad, f, eventId)).GetProperty("uploads").GetProperty("used").GetInt32());

        api.Clock.SetUtcNow(_during.AddMinutes(16));
        Assert.Equal(1, await cleanup.CleanUpAsync(TestContext.Current.CancellationToken));
        Assert.Equal(0, (await EventAsync(f.Dad, f, eventId)).GetProperty("uploads").GetProperty("used").GetInt32());
    }

    [Fact]
    public async Task A_parent_who_deletes_their_account_takes_their_photos_with_them()
    {
        using var f = await FamilyAsync();
        var eventId = await ActivityAsync(f);
        var dads = await UploadAsync(f.Dad, f, eventId, Jpeg(SKColors.Red));
        var moms = await UploadAsync(f.Mom, f, eventId, Jpeg(SKColors.Blue));
        await ShareAsync(f.Mom, f, moms.GetProperty("batchId").GetGuid(), true);

        Assert.Equal(HttpStatusCode.NoContent, (await f.Mom.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);

        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync(Url(moms.GetProperty("photo"), "url"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Dad.GetAsync(Url(dads.GetProperty("photo"), "url"))).StatusCode);
        Assert.Equal(1, await api.Services.GetRequiredService<IEventPhotoCleanup>().CleanUpAsync(TestContext.Current.CancellationToken));

        // Now the only parent, Dad may use all 20 spots on the shared event.
        Assert.Equal(20, (await EventAsync(f.Dad, f, eventId)).GetProperty("uploads").GetProperty("cap").GetInt32());
    }

    private async Task FillStorageAsync(TestFamily f, Guid eventId, Guid uploader, long bytes)
    {
        var batch = Guid.CreateVersion7();
        await api.QueryScalarAsync<object>(
            """
            INSERT INTO memories.photo_batches (id, family_id, event_id, uploader_membership_id, visible_to_co_parent, created_at)
            VALUES (@batch, @family, @event, @uploader, false, @now);
            INSERT INTO memories.event_photos (id, family_id, batch_id, event_id, uploader_membership_id, position, state, width, height,
                photo_bytes, thumbnail_bytes, created_at, expires_at)
            VALUES (@photo, @family, @batch, @event, @uploader, 1, 'Active', 10, 10, @bytes, 0, @now, @expires);
            """,
            ("batch", batch), ("photo", Guid.CreateVersion7()), ("family", f.FamilyId), ("event", eventId), ("uploader", uploader),
            ("bytes", bytes), ("now", _during), ("expires", _during.AddDays(28)));
    }

    private static async Task ApproveAsync(TestFamily f, JsonElement created) =>
        Assert.Equal(
            HttpStatusCode.OK,
            (await f.Mom.PostAsync(f.Path($"approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve"))).StatusCode);

    private object Event(string category, string title, Guid? caregiver = null) => new
    {
        category,
        title,
        startsAt = _start,
        endsAt = _start.AddHours(2),
        allDay = false,
        childIds = new[] { _kaiId },
        caregiverMembershipId = caregiver,
    };

    private async Task<Guid> ActivityAsync(TestFamily f, string title = "Soccer final")
    {
        var created = await f.Dad.PostAsync(f.Path("calendar/events"), Event("Activity", title));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        if (api.Clock.GetUtcNow() < _during)
        {
            api.Clock.SetUtcNow(_during);
        }

        return (await JsonAsync(created)).GetProperty("id").GetGuid();
    }

    private static async Task<JsonElement> UploadAsync(ApiSession parent, TestFamily f, Guid eventId, byte[] file, Guid? batchId = null)
    {
        var path = f.Path($"memories/events/{eventId}/photos") + (batchId is { } id ? $"?batchId={id}" : string.Empty);
        var response = await parent.SendBytesAsync(HttpMethod.Post, path, file);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        return await JsonAsync(response);
    }

    private static async Task AssertRefusedAsync(ApiSession parent, TestFamily f, Guid eventId, HttpStatusCode status, string? reason, Guid? batchId = null)
    {
        var path = f.Path($"memories/events/{eventId}/photos") + (batchId is { } id ? $"?batchId={id}" : string.Empty);
        var response = await parent.SendBytesAsync(HttpMethod.Post, path, Jpeg(SKColors.Red));
        Assert.Equal(status, response.StatusCode);
        if (reason is not null)
        {
            Assert.Equal(reason, (await JsonAsync(response)).GetProperty("reason").GetString());
        }
    }

    private static async Task ShareAsync(ApiSession parent, TestFamily f, Guid batchId, bool visible) =>
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await parent.SendAsync(HttpMethod.Patch, f.Path($"memories/batches/{batchId}"), new { visibleToCoParent = visible })).StatusCode);

    private static async Task DeleteAsync(ApiSession parent, TestFamily f, Guid photoId) =>
        Assert.Equal(HttpStatusCode.NoContent, (await parent.SendAsync(HttpMethod.Delete, f.Path($"memories/photos/{photoId}"))).StatusCode);

    private static async Task<JsonElement> EventAsync(ApiSession parent, TestFamily f, Guid eventId)
    {
        var response = await parent.GetAsync(f.Path($"memories/events/{eventId}"));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await JsonAsync(response);
    }

    private static string Url(JsonElement photo, string name) => photo.GetProperty(name).GetString()!;

    private static byte[] Jpeg(SKColor colour)
    {
        using var bitmap = new SKBitmap(640, 480);
        bitmap.Erase(colour);
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(SKEncodedImageFormat.Jpeg, 90);
        return data.ToArray();
    }

    private static bool IsClose(SKColor actual, SKColor expected) =>
        Math.Abs(actual.Red - expected.Red) < 40 && Math.Abs(actual.Green - expected.Green) < 40 && Math.Abs(actual.Blue - expected.Blue) < 40;

    private async Task<TestFamily> FamilyAsync()
    {
        var dadEmail = ApiSession.NewEmail();
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad", email: dadEmail);
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        Assert.Equal(
            HttpStatusCode.OK,
            (await mom.PostAsync($"/api/families/{familyId}/approvals/{kai.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await dad.SendAsync(HttpMethod.Put, $"/api/families/{familyId}/children/{kai.GetProperty("id").GetGuid()}/pin", new { pin = KaisPin })).StatusCode);

        var details = await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"));
        var dadMembership = details.GetProperty("members").EnumerateArray()
            .Single(m => m.GetProperty("isYou").GetBoolean()).GetProperty("membershipId").GetGuid();
        _kaiId = kai.GetProperty("id").GetGuid();
        return new TestFamily(dad, mom, familyId, _kaiId, dadMembership, dadEmail, momEmail);
    }

    /// <summary>The parents sign in again after the clock jumps further than a sign-in lasts.</summary>
    private sealed class TestFamily(ApiSession dad, ApiSession mom, Guid familyId, Guid kaiId, Guid dadMembershipId, string dadEmail, string momEmail)
        : IDisposable
    {
        public ApiSession Dad { get; private set; } = dad;

        public ApiSession Mom { get; private set; } = mom;

        public Guid FamilyId => familyId;

        public Guid KaiId => kaiId;

        public Guid DadMembershipId => dadMembershipId;

        public string DadEmail => dadEmail;

        public string Path(string rest) => $"/api/families/{FamilyId}/{rest}";

        public async Task SignInAgainAsync(ApiFactory api)
        {
            Dispose();
            Dad = await ApiSession.StartAsync(api);
            Assert.Equal(HttpStatusCode.NoContent, (await Dad.LoginAsync(dadEmail)).StatusCode);
            Mom = await ApiSession.StartAsync(api);
            Assert.Equal(HttpStatusCode.NoContent, (await Mom.LoginAsync(momEmail)).StatusCode);
        }

        public void Dispose()
        {
            Dad.Dispose();
            Mom.Dispose();
        }
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
