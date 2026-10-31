using System.Buffers.Binary;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using SkiaSharp;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Profile photos (#388): each parent's own photo, each parent's personal photo for each child, and each child's own
/// photo, with two parents, two siblings, a shared kitchen device and a separate household. Images are generated
/// solid colours; names are synthetic.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ProfilePhotoTests(ApiFactory api) : IAsyncLifetime
{
    private const string KaisPin = "2580";
    private const string MiasPin = "1357";
    private const string DadsPin = "583920";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task A_parent_sets_replaces_and_removes_their_own_photo_and_the_co_parent_sees_it()
    {
        using var family = await FamilyAsync();

        var first = await UploadAsync(family.Dad, family.Path("photos/me"), Jpeg(SKColors.Red));
        Assert.Equal("parent", first.GetProperty("kind").GetString());
        Assert.Equal(family.DadMembershipId, first.GetProperty("id").GetGuid());
        var firstUrl = first.GetProperty("url").GetString()!;
        Assert.Equal(firstUrl, await PhotoUrlAsync(family.Mom, family, "parent", family.DadMembershipId));
        Assert.Equal(SKColors.Red, await CentreColourAsync(family.Mom, firstUrl));

        var second = await UploadAsync(family.Dad, family.Path("photos/me"), Png(SKColors.Blue));
        var secondUrl = second.GetProperty("url").GetString()!;
        Assert.NotEqual(firstUrl, secondUrl);
        Assert.Equal(HttpStatusCode.NotFound, (await family.Dad.GetAsync(firstUrl)).StatusCode); // the old photo is gone
        Assert.Equal(secondUrl, await PhotoUrlAsync(family.Dad, family, "parent", family.DadMembershipId));
        Assert.Equal(1, await PhotoRowsAsync());

        Assert.Equal(HttpStatusCode.NoContent, (await family.Dad.SendAsync(HttpMethod.Delete, family.Path("photos/me"))).StatusCode);
        Assert.Null(await PhotoUrlAsync(family.Mom, family, "parent", family.DadMembershipId));
        Assert.Equal(HttpStatusCode.NotFound, (await family.Mom.GetAsync(secondUrl)).StatusCode);
        Assert.Equal(0, await PhotoRowsAsync());
    }

    [Fact]
    public async Task A_parent_cannot_change_the_other_parents_photo()
    {
        using var family = await FamilyAsync();
        var dads = (await UploadAsync(family.Dad, family.Path("photos/me"), Jpeg(SKColors.Red))).GetProperty("url").GetString()!;

        // Mom's "me" is always Mom; a membership id isn't a child, so the child route refuses it.
        await UploadAsync(family.Mom, family.Path("photos/me"), Jpeg(SKColors.Green));
        var forged = await family.Mom.SendBytesAsync(HttpMethod.Put, family.Path($"photos/children/{family.DadMembershipId}"), Jpeg(SKColors.Blue));
        var forgedDelete = await family.Mom.SendAsync(HttpMethod.Delete, family.Path($"photos/children/{family.DadMembershipId}"));

        Assert.Equal(HttpStatusCode.NotFound, forged.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, forgedDelete.StatusCode); // nothing of Mom's to remove
        Assert.Equal(dads, await PhotoUrlAsync(family.Dad, family, "parent", family.DadMembershipId));
        Assert.Equal(SKColors.Red, await CentreColourAsync(family.Dad, dads));
    }

    [Fact]
    public async Task Each_parent_keeps_their_own_photo_for_the_same_child_and_never_sees_the_others()
    {
        using var family = await FamilyAsync();

        var dads = (await UploadAsync(family.Dad, family.Path($"photos/children/{family.KaiId}"), Jpeg(SKColors.Red))).GetProperty("url").GetString()!;
        var moms = (await UploadAsync(family.Mom, family.Path($"photos/children/{family.KaiId}"), Jpeg(SKColors.Blue))).GetProperty("url").GetString()!;

        // A fresh sign-in (a reload or another browser) keeps each parent's own choice.
        using var dadAgain = await ApiSession.StartAsync(api);
        Assert.Equal(HttpStatusCode.NoContent, (await dadAgain.LoginAsync(family.DadEmail)).StatusCode);
        Assert.Equal(dads, await PhotoUrlAsync(dadAgain, family, "child", family.KaiId));
        Assert.Equal(moms, await PhotoUrlAsync(family.Mom, family, "child", family.KaiId));
        Assert.Equal(SKColors.Red, await CentreColourAsync(dadAgain, dads));

        // Neither can read the other's choice, even with its URL.
        Assert.Equal(HttpStatusCode.NotFound, (await family.Mom.GetAsync(dads)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dadAgain.GetAsync(moms)).StatusCode);

        // Removing Dad's leaves Mom's; Dad's view falls back to initials (no photo), not Mom's choice.
        Assert.Equal(HttpStatusCode.NoContent, (await dadAgain.SendAsync(HttpMethod.Delete, family.Path($"photos/children/{family.KaiId}"))).StatusCode);
        Assert.Null(await PhotoUrlAsync(dadAgain, family, "child", family.KaiId));
        Assert.Equal(moms, await PhotoUrlAsync(family.Mom, family, "child", family.KaiId));
    }

    [Fact]
    public async Task A_child_sets_only_their_own_photo_and_the_picker_shows_it_instead_of_the_parents_choices()
    {
        using var family = await FamilyAsync();
        await UploadAsync(family.Dad, family.Path($"photos/children/{family.KaiId}"), Jpeg(SKColors.Red));
        await UploadAsync(family.Mom, family.Path($"photos/children/{family.KaiId}"), Jpeg(SKColors.Blue));
        using var kitchen = await KitchenAsync(family);
        Assert.Null(TilePhoto(await PickerAsync(kitchen), family.KaiId)); // the parents' choices never reach the picker

        await ChildSignInAsync(kitchen, family.KaiId, KaisPin);
        var kais = await UploadAsync(kitchen, family.Path("photos/me"), Jpeg(SKColors.Green));
        Assert.Equal("child", kais.GetProperty("kind").GetString());
        Assert.Equal(family.KaiId, kais.GetProperty("id").GetGuid());
        var own = kais.GetProperty("url").GetString()!;
        Assert.Equal(own, await PhotoUrlAsync(kitchen, family, "child", family.KaiId));
        Assert.Equal(SKColors.Green, await CentreColourAsync(kitchen, own));

        // The picker and PIN screen use Kai's own photo; each parent's personal choice is unchanged.
        var tile = TilePhoto(await PickerAsync(kitchen), family.KaiId)!;
        Assert.StartsWith("/api/device/photos/", tile, StringComparison.Ordinal);
        Assert.Equal(SKColors.Green, await CentreColourAsync(kitchen, tile));
        Assert.Equal(SKColors.Red, await CentreColourAsync(family.Dad, (await PhotoUrlAsync(family.Dad, family, "child", family.KaiId))!));
        Assert.Equal(SKColors.Blue, await CentreColourAsync(family.Mom, (await PhotoUrlAsync(family.Mom, family, "child", family.KaiId))!));

        // A parent's view of Kai never shows Kai's own photo either.
        Assert.Equal(HttpStatusCode.NotFound, (await family.Dad.GetAsync(own)).StatusCode);

        // It persists into Kai's next session.
        await SwitchAsync(kitchen);
        await ChildSignInAsync(kitchen, family.KaiId, KaisPin);
        Assert.Equal(own, await PhotoUrlAsync(kitchen, family, "child", family.KaiId));
    }

    [Fact]
    public async Task A_child_cannot_set_or_read_anyone_elses_photo()
    {
        using var family = await FamilyAsync();
        var dadsOwn = (await UploadAsync(family.Dad, family.Path("photos/me"), Jpeg(SKColors.Red))).GetProperty("url").GetString()!;
        var dadsForKai = (await UploadAsync(family.Dad, family.Path($"photos/children/{family.KaiId}"), Jpeg(SKColors.Red))).GetProperty("url").GetString()!;
        using var kitchen = await KitchenAsync(family);
        await ChildSignInAsync(kitchen, family.MiaId, MiasPin);
        var miasOwn = (await UploadAsync(kitchen, family.Path("photos/me"), Jpeg(SKColors.Blue))).GetProperty("url").GetString()!;
        await SwitchAsync(kitchen);
        await ChildSignInAsync(kitchen, family.KaiId, KaisPin);

        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.SendBytesAsync(HttpMethod.Put, family.Path($"photos/children/{family.MiaId}"), Jpeg(SKColors.Green))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await kitchen.SendAsync(HttpMethod.Delete, family.Path($"photos/children/{family.KaiId}"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await kitchen.GetAsync(miasOwn)).StatusCode); // a sibling's photo
        Assert.Equal(HttpStatusCode.NotFound, (await kitchen.GetAsync(dadsForKai)).StatusCode); // a parent's personal choice
        Assert.Equal(HttpStatusCode.NotFound, (await kitchen.GetAsync(dadsOwn)).StatusCode);
        var kaisView = await JsonAsync(await kitchen.GetAsync(family.Path("photos")));
        Assert.Equal("child", kaisView.GetProperty("youKind").GetString());
        Assert.Equal(family.KaiId, kaisView.GetProperty("youId").GetGuid());
        Assert.Empty(kaisView.GetProperty("photos").EnumerateArray());

        // Removing "my" photo as Kai leaves Mia's alone.
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.SendAsync(HttpMethod.Delete, family.Path("photos/me"))).StatusCode);
        Assert.NotNull(TilePhoto(await PickerAsync(kitchen), family.MiaId));
    }

    [Fact]
    public async Task Another_household_and_revoked_devices_cannot_read_photos()
    {
        using var family = await FamilyAsync();
        var dadsOwn = (await UploadAsync(family.Dad, family.Path("photos/me"), Jpeg(SKColors.Red))).GetProperty("url").GetString()!;
        using var kitchen = await KitchenAsync(family);
        await ChildSignInAsync(kitchen, family.KaiId, KaisPin);
        await UploadAsync(kitchen, family.Path("photos/me"), Jpeg(SKColors.Green));
        await SwitchAsync(kitchen);
        var picker = await PickerAsync(kitchen);
        var kaisTile = TilePhoto(picker, family.KaiId)!;
        var dadsTile = TilePhoto(picker, family.DadMembershipId)!;
        Assert.Equal(SKColors.Red, await CentreColourAsync(kitchen, dadsTile));

        // A separate family's parent, with their own shared device, gets nothing from guessed or copied URLs.
        using var other = await ApiSession.SignedInAsync(api, displayName: "Sam");
        var otherFamily = await other.CreateFamilyAsync("Okafor Family");
        Assert.Equal(
            HttpStatusCode.Created,
            (await other.PostAsync($"/api/families/{otherFamily}/devices/household", new { name = "Hall tablet", pin = "802461" })).StatusCode);
        foreach (var url in new[] { dadsOwn, kaisTile, dadsTile, family.Path($"photos/{Guid.CreateVersion7()}") })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(url)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/device/photos/{IdOf(dadsOwn)}")).StatusCode);

        // The kitchen device is revoked: its picker photos stop at once.
        var devices = await JsonAsync(await family.Mom.GetAsync(family.Path("devices")));
        var kitchenId = devices.EnumerateArray().Single().GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await family.Mom.SendAsync(HttpMethod.Delete, family.Path($"devices/{kitchenId}"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await kitchen.GetAsync(kaisTile)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await kitchen.GetAsync(dadsTile)).StatusCode);
    }

    [Fact]
    public async Task Uploads_must_be_real_bounded_images()
    {
        using var family = await FamilyAsync();
        var kept = (await UploadAsync(family.Dad, family.Path("photos/me"), Jpeg(SKColors.Red))).GetProperty("url").GetString()!;

        await RefusedAsync(family, Encoding.UTF8.GetBytes("<svg xmlns='http://www.w3.org/2000/svg'/>"), HttpStatusCode.UnsupportedMediaType, "unsupported");
        await RefusedAsync(family, Encoding.UTF8.GetBytes("GIF89a not really"), HttpStatusCode.UnsupportedMediaType, "unsupported");
        await RefusedAsync(family, [], HttpStatusCode.BadRequest, "empty");
        await RefusedAsync(family, new byte[(8 * 1024 * 1024) + 1], HttpStatusCode.RequestEntityTooLarge, "too-large");
        await RefusedAsync(family, PngClaiming(20_000, 20_000), HttpStatusCode.BadRequest, "too-many-pixels");
        var cut = Jpeg(SKColors.Blue);
        await RefusedAsync(family, cut[..(cut.Length / 2)], HttpStatusCode.BadRequest, "damaged");

        // Every failed replacement kept the previous photo.
        Assert.Equal(kept, await PhotoUrlAsync(family.Dad, family, "parent", family.DadMembershipId));
        Assert.Equal(SKColors.Red, await CentreColourAsync(family.Dad, kept));
    }

    [Fact]
    public async Task Stored_photos_are_upright_small_squares_without_the_uploads_metadata()
    {
        using var family = await FamilyAsync();

        // A 1200x800 JPEG, red on the left and blue on the right, taken with the camera turned (EXIF orientation 6),
        // and carrying a description that stands in for location data.
        var upload = TestImages.WithExif(TestImages.HalvesJpeg(1200, 800), orientation: 6, description: "SYNTHETIC-GPS 41.88N 87.62W");
        var url = (await UploadAsync(family.Dad, family.Path("photos/me"), upload)).GetProperty("url").GetString()!;
        var response = await family.Dad.GetAsync(url);
        var bytes = await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);

        Assert.Equal("image/webp", response.Content.Headers.ContentType?.MediaType);
        Assert.True(response.Headers.CacheControl is { Private: true, NoCache: true });
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.True(bytes.Length <= 200 * 1024);
        Assert.Equal(-1, bytes.AsSpan().IndexOf("SYNTHETIC-GPS"u8));
        Assert.Equal(-1, bytes.AsSpan().IndexOf("Exif"u8));
        using var bitmap = SKBitmap.Decode(bytes);
        Assert.Equal(512, bitmap.Width);
        Assert.Equal(512, bitmap.Height);

        // Turned upright: the camera's left (red) is now at the top, its right (blue) at the bottom.
        Assert.True(IsClose(bitmap.GetPixel(256, 20), SKColors.Red));
        Assert.True(IsClose(bitmap.GetPixel(256, 490), SKColors.Blue));

        // The browser can revalidate with the id as its tag.
        var again = new HttpRequestMessage(HttpMethod.Get, url);
        again.Headers.IfNoneMatch.Add(response.Headers.ETag!);
        Assert.Equal(HttpStatusCode.NotModified, (await family.Dad.Client.SendAsync(again, TestContext.Current.CancellationToken)).StatusCode);
    }

    [Fact]
    public async Task Uploads_need_the_antiforgery_token()
    {
        using var family = await FamilyAsync();
        var request = new HttpRequestMessage(HttpMethod.Put, family.Path("photos/me")) { Content = new ByteArrayContent(Jpeg(SKColors.Red)) };

        var response = await family.Dad.Client.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(0, await PhotoRowsAsync());
    }

    [Fact]
    public async Task Deleting_an_account_removes_that_parents_photos_and_keeps_the_co_parents()
    {
        using var family = await FamilyAsync();
        await UploadAsync(family.Dad, family.Path("photos/me"), Jpeg(SKColors.Red));
        await UploadAsync(family.Dad, family.Path($"photos/children/{family.KaiId}"), Jpeg(SKColors.Red));
        var moms = (await UploadAsync(family.Mom, family.Path($"photos/children/{family.KaiId}"), Jpeg(SKColors.Blue))).GetProperty("url").GetString()!;

        var deleted = await family.Dad.PostAsync("/api/me/delete", new { password = ApiSession.Password });

        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal(1, await PhotoRowsAsync());
        Assert.Equal(moms, await PhotoUrlAsync(family.Mom, family, "child", family.KaiId));
        Assert.Null(await PhotoUrlAsync(family.Mom, family, "parent", family.DadMembershipId));
    }

    private static async Task RefusedAsync(TestFamily family, byte[] body, HttpStatusCode status, string reason)
    {
        var response = await family.Dad.SendBytesAsync(HttpMethod.Put, family.Path("photos/me"), body);
        Assert.Equal(status, response.StatusCode);
        Assert.Equal(reason, (await JsonAsync(response)).GetProperty("reason").GetString());
    }

    private async Task<long> PhotoRowsAsync() => await api.QueryScalarAsync<long>("SELECT count(*) FROM families.profile_photos");

    private static async Task<JsonElement> UploadAsync(ApiSession session, string path, byte[] image)
    {
        var response = await session.SendBytesAsync(HttpMethod.Put, path, image);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await JsonAsync(response);
    }

    private static async Task<string?> PhotoUrlAsync(ApiSession session, TestFamily family, string kind, Guid id)
    {
        var photos = await JsonAsync(await session.GetAsync(family.Path("photos")));
        return photos.GetProperty("photos").EnumerateArray()
            .Where(p => p.GetProperty("kind").GetString() == kind && p.GetProperty("id").GetGuid() == id)
            .Select(p => p.GetProperty("url").GetString())
            .SingleOrDefault();
    }

    private static async Task<SKColor> CentreColourAsync(ApiSession session, string url)
    {
        var response = await session.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var bitmap = SKBitmap.Decode(await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
        var pixel = bitmap.GetPixel(bitmap.Width / 2, bitmap.Height / 2);
        return new[] { SKColors.Red, SKColors.Green, SKColors.Blue }.Single(c => IsClose(pixel, c));
    }

    private static bool IsClose(SKColor actual, SKColor expected) =>
        Math.Abs(actual.Red - expected.Red) < 40 && Math.Abs(actual.Green - expected.Green) < 40 && Math.Abs(actual.Blue - expected.Blue) < 40;

    private static Guid IdOf(string url) => Guid.Parse(url[(url.LastIndexOf('/') + 1)..]);

    private static async Task<JsonElement> PickerAsync(ApiSession session) => await JsonAsync(await session.GetAsync("/api/device/profiles"));

    private static string? TilePhoto(JsonElement picker, Guid id) => picker.GetProperty("profiles").EnumerateArray()
        .Single(p => p.GetProperty("id").GetGuid() == id)
        .GetProperty("photoUrl").GetString();

    private static byte[] Jpeg(SKColor colour) => Encode(Solid(640, 480, colour), SKEncodedImageFormat.Jpeg);

    private static byte[] Png(SKColor colour) => Encode(Solid(300, 300, colour), SKEncodedImageFormat.Png);

    private static SKBitmap Solid(int width, int height, SKColor colour)
    {
        var bitmap = new SKBitmap(width, height);
        bitmap.Erase(colour);
        return bitmap;
    }

    private static byte[] Encode(SKBitmap bitmap, SKEncodedImageFormat format, bool dispose = true)
    {
        try
        {
            using var image = SKImage.FromBitmap(bitmap);
            using var data = image.Encode(format, 90);
            return data.ToArray();
        }
        finally
        {
            if (dispose)
            {
                bitmap.Dispose();
            }
        }
    }

    /// <summary>A tiny PNG whose header claims <paramref name="width"/> by <paramref name="height"/> pixels.</summary>
    private static byte[] PngClaiming(int width, int height)
    {
        var png = Png(SKColors.Red);
        BinaryPrimitives.WriteInt32BigEndian(png.AsSpan(16), width);
        BinaryPrimitives.WriteInt32BigEndian(png.AsSpan(20), height);
        var crc = Crc32(png.AsSpan(12, 17));
        BinaryPrimitives.WriteUInt32BigEndian(png.AsSpan(29), crc);
        return png;
    }

    private static uint Crc32(ReadOnlySpan<byte> bytes)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in bytes)
        {
            crc ^= b;
            for (var i = 0; i < 8; i++)
            {
                crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
            }
        }

        return ~crc;
    }

    private async Task<ApiSession> KitchenAsync(TestFamily family)
    {
        var kitchen = await ApiSession.StartAsync(api);
        Assert.Equal(HttpStatusCode.NoContent, (await kitchen.LoginAsync(family.DadEmail)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Created,
            (await kitchen.PostAsync(family.Path("devices/household"), new { name = "Kitchen iPad", pin = DadsPin })).StatusCode);
        await SwitchAsync(kitchen);
        return kitchen;
    }

    private static async Task SwitchAsync(ApiSession session)
    {
        await session.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await session.PostAsync("/api/device/switch")).StatusCode);
        await session.RefreshAntiforgeryAsync();
    }

    private static async Task ChildSignInAsync(ApiSession session, Guid childId, string pin)
    {
        Assert.Equal(HttpStatusCode.NoContent, (await session.PostAsync("/api/device/child-session", new { childId, pin })).StatusCode);
        await session.RefreshAntiforgeryAsync();
    }

    /// <summary>Dad and Mom, with Kai and Mia approved by both and their PINs set.</summary>
    private async Task<TestFamily> FamilyAsync()
    {
        var dadEmail = ApiSession.NewEmail();
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad", email: dadEmail);
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        var mia = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Mia" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        foreach (var (child, pin) in new[] { (kai, KaisPin), (mia, MiasPin) })
        {
            Assert.Equal(
                HttpStatusCode.OK,
                (await mom.PostAsync($"/api/families/{familyId}/approvals/{child.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
            Assert.Equal(
                HttpStatusCode.NoContent,
                (await dad.SendAsync(HttpMethod.Put, $"/api/families/{familyId}/children/{child.GetProperty("id").GetGuid()}/pin", new { pin })).StatusCode);
        }

        var details = await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"));
        var dadMembership = details.GetProperty("members").EnumerateArray()
            .Single(m => m.GetProperty("isYou").GetBoolean()).GetProperty("membershipId").GetGuid();
        return new TestFamily(dad, mom, familyId, kai.GetProperty("id").GetGuid(), mia.GetProperty("id").GetGuid(), dadMembership, dadEmail);
    }

    private sealed record TestFamily(
        ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId, Guid MiaId, Guid DadMembershipId, string DadEmail) : IDisposable
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
}
