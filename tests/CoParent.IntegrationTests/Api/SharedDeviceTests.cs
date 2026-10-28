using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Shared family devices, parent PINs, switching and full sign-out, revocation, expiry and lost access (#153,
/// ADR-0007). Families and names are synthetic.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class SharedDeviceTests(ApiFactory api) : IAsyncLifetime
{
    private const string KaisPin = "2580";
    private const string DadsPin = "583920";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync()
    {
        api.Clock.Reset();
        return ValueTask.CompletedTask;
    }

    [Fact]
    public async Task Signing_in_never_sets_up_a_shared_device_on_its_own()
    {
        var family = await FamilyAsync(sharedDevice: false);
        using var _ = family;

        Assert.Equal(HttpStatusCode.NotFound, (await family.Dad.GetAsync("/api/device/profiles")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ChildSignInAsync(family.Dad, family, KaisPin)).StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("12345")]
    [InlineData("1234567")]
    [InlineData("123456")]
    [InlineData("777777")]
    [InlineData("12a456")]
    public async Task Setup_needs_a_six_digit_parent_PIN_that_isnt_trivial(string? pin)
    {
        var family = await FamilyAsync(sharedDevice: false);
        using var _ = family;

        var response = await family.Dad.PostAsync($"/api/families/{family.FamilyId}/devices/household", new { name = "Kitchen iPad", pin });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await family.Dad.GetAsync("/api/device/profiles")).StatusCode);
    }

    [Fact]
    public async Task Setup_keeps_the_parent_signed_in_and_shows_only_that_parent_and_approved_children()
    {
        var family = await FamilyAsync();
        using var _ = family;
        await family.Dad.PostAsync($"/api/families/{family.FamilyId}/children", new { firstName = "Aurora" }); // pending approval

        var me = await family.Dad.GetAsync("/api/me");
        var picker = await JsonAsync(await family.Dad.GetAsync("/api/device/profiles"));
        var devices = await JsonAsync(await family.Dad.GetAsync($"/api/families/{family.FamilyId}/devices"));

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal(["parent:Dad:True", "child:Kai:True"], Tiles(picker));
        Assert.True(picker.GetProperty("isYours").GetBoolean());
        var device = Assert.Single(devices.EnumerateArray());
        var created = device.GetProperty("createdAt").GetDateTimeOffset();
        Assert.Equal(created.AddDays(30), device.GetProperty("expiresAt").GetDateTimeOffset());
    }

    [Fact]
    public async Task A_parent_who_already_has_a_PIN_sets_up_another_device_without_choosing_one_again()
    {
        var family = await FamilyAsync();
        using var _ = family;
        using var laptop = await ApiSession.StartAsync(api);
        Assert.Equal(HttpStatusCode.NoContent, (await laptop.LoginAsync(family.DadEmail)).StatusCode);

        var setUp = await laptop.PostAsync($"/api/families/{family.FamilyId}/devices/household", new { name = "Family laptop" });

        Assert.Equal(HttpStatusCode.Created, setUp.StatusCode);
    }

    [Fact]
    public async Task The_parent_enters_their_profile_with_their_PIN_and_the_other_parent_cannot()
    {
        var family = await FamilyAsync();
        using var _ = family;
        await SwitchAsync(family.Dad);
        var momsMembership = await MembershipIdAsync(family.Mom, family.FamilyId);

        var asMom = await family.Dad.PostAsync("/api/device/parent-session", new { membershipId = momsMembership, pin = DadsPin });
        var wrong = await family.Dad.PostAsync("/api/device/parent-session", new { membershipId = family.DadMembershipId, pin = "111222" });
        var right = await family.Dad.PostAsync("/api/device/parent-session", new { membershipId = family.DadMembershipId, pin = DadsPin });
        var me = await JsonAsync(await family.Dad.GetAsync("/api/me"));

        Assert.Equal(HttpStatusCode.Forbidden, asMom.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, right.StatusCode);
        Assert.Equal("Dad", me.GetProperty("displayName").GetString());
    }

    [Fact]
    public async Task A_parent_PIN_doesnt_work_on_a_browser_that_isnt_their_shared_device()
    {
        var family = await FamilyAsync();
        using var _ = family;
        using var stranger = await ApiSession.StartAsync(api);

        var response = await stranger.PostAsync("/api/device/parent-session", new { membershipId = family.DadMembershipId, pin = DadsPin });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await stranger.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Parent_PIN_pauses_then_locks_emails_only_that_parent_and_password_sign_in_still_resets_it()
    {
        var family = await FamilyAsync();
        using var _ = family;
        var device = family.Dad;
        await SwitchAsync(device);

        await ParentPinAsync(device, family, "111222");
        await ParentPinAsync(device, family, "111223");
        var third = await ParentPinAsync(device, family, "111224");
        var rightDuringPause = await ParentPinAsync(device, family, DadsPin);

        Assert.Equal((HttpStatusCode)423, third.StatusCode);
        var paused = await JsonAsync(third);
        Assert.Equal("paused", paused.GetProperty("state").GetString());
        Assert.True(paused.GetProperty("notified").GetBoolean());
        Assert.Equal((HttpStatusCode)423, rightDuringPause.StatusCode);
        var pauseEmail = Assert.Single(device.Emails.SentTo(family.DadEmail), m => m.Subject == "Your parent PIN is paused");
        Assert.DoesNotContain(DadsPin, pauseEmail.TextBody, StringComparison.Ordinal);
        Assert.Contains("America/Chicago", pauseEmail.TextBody, StringComparison.Ordinal);
        Assert.DoesNotContain(device.Emails.SentTo(family.MomEmail), m => m.Subject.Contains("parent PIN", StringComparison.Ordinal));

        api.Clock.Advance(TimeSpan.FromMinutes(10));
        await ParentPinAsync(device, family, "111222");
        await ParentPinAsync(device, family, "111223");
        var sixth = await ParentPinAsync(device, family, "111224");
        var rightButLocked = await ParentPinAsync(device, family, DadsPin);

        Assert.Equal("locked", (await JsonAsync(sixth)).GetProperty("state").GetString());
        Assert.Equal((HttpStatusCode)423, rightButLocked.StatusCode);
        Assert.Single(device.Emails.SentTo(family.DadEmail), m => m.Subject == "Your parent PIN is locked");
        Assert.DoesNotContain(device.Emails.SentTo(family.MomEmail), m => m.Subject.Contains("parent PIN", StringComparison.Ordinal));

        // The account isn't locked: password sign-in works, and a new PIN (after confirming the password) clears the lock.
        Assert.Equal(HttpStatusCode.NoContent, (await device.LoginAsync(family.DadEmail)).StatusCode);
        var status = await JsonAsync(await device.GetAsync($"/api/families/{family.FamilyId}/parent-pin"));
        Assert.True(status.GetProperty("locked").GetBoolean());
        var badPassword = await device.SendAsync(
            HttpMethod.Put, $"/api/families/{family.FamilyId}/parent-pin", new { currentPassword = "not my password", pin = "604918" });
        var newPin = await device.SendAsync(
            HttpMethod.Put, $"/api/families/{family.FamilyId}/parent-pin", new { currentPassword = ApiSession.Password, pin = "604918" });
        Assert.Equal(HttpStatusCode.BadRequest, badPassword.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, newPin.StatusCode);

        await SwitchAsync(device);
        Assert.Equal(HttpStatusCode.Unauthorized, (await ParentPinAsync(device, family, DadsPin)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await ParentPinAsync(device, family, "604918")).StatusCode);
    }

    [Fact]
    public async Task A_parent_PIN_pause_applies_across_devices()
    {
        var family = await FamilyAsync();
        using var _ = family;
        using var laptop = await ApiSession.StartAsync(api);
        await laptop.LoginAsync(family.DadEmail);
        await laptop.PostAsync($"/api/families/{family.FamilyId}/devices/household", new { name = "Family laptop" });
        await SwitchAsync(laptop);
        await SwitchAsync(family.Dad);

        await ParentPinAsync(family.Dad, family, "111222");
        await ParentPinAsync(family.Dad, family, "111223");
        await ParentPinAsync(laptop, family, "111224");
        var onTheTablet = await ParentPinAsync(family.Dad, family, DadsPin);

        Assert.Equal("paused", (await JsonAsync(onTheTablet)).GetProperty("state").GetString());
    }

    [Fact]
    public async Task Concurrent_wrong_PINs_cant_get_past_the_pause()
    {
        var family = await FamilyAsync();
        using var _ = family;
        await SwitchAsync(family.Dad);

        var responses = await Task.WhenAll(Enumerable.Range(0, 12).Select(i => ParentPinAsync(family.Dad, family, $"1112{i:00}")));

        // Racing guesses are either counted one at a time or refused with a neutral "try again": never more than two
        // "wrong, tries left" answers before the pause, and nothing else gets through.
        Assert.True(responses.Count(r => r.StatusCode == HttpStatusCode.Unauthorized) <= 2);
        Assert.All(responses, r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.Unauthorized, (HttpStatusCode)423, HttpStatusCode.Conflict }));
        Assert.All(
            responses.Where(r => r.StatusCode == HttpStatusCode.Conflict),
            r => Assert.DoesNotContain("triesLeft", r.Content.ReadAsStringAsync(TestContext.Current.CancellationToken).Result, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Switching_to_a_child_ends_the_parent_session_and_switching_keeps_the_picker()
    {
        var family = await FamilyAsync();
        using var _ = family;

        Assert.Equal(HttpStatusCode.NoContent, (await ChildSignInAsync(family.Dad, family, KaisPin)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.GetAsync($"/api/families/{family.FamilyId}/devices")).StatusCode);

        await SwitchAsync(family.Dad);

        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/session/child")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await family.Dad.GetAsync("/api/device/profiles")).StatusCode);
    }

    [Fact]
    public async Task Full_sign_out_removes_the_picker_and_signing_in_again_doesnt_restore_it()
    {
        var family = await FamilyAsync();
        using var _ = family;

        Assert.Equal(HttpStatusCode.NoContent, (await family.Dad.PostAsync("/api/auth/logout")).StatusCode);
        await family.Dad.RefreshAntiforgeryAsync();
        var pickerAfterSignOut = await family.Dad.GetAsync("/api/device/profiles");
        var pinAfterSignOut = await ParentPinAsync(family.Dad, family, DadsPin);
        await family.Dad.LoginAsync(family.DadEmail);
        var pickerAfterSignIn = await family.Dad.GetAsync("/api/device/profiles");

        Assert.Equal(HttpStatusCode.NotFound, pickerAfterSignOut.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, pinAfterSignOut.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, pickerAfterSignIn.StatusCode);
        Assert.Empty((await JsonAsync(await family.Dad.GetAsync($"/api/families/{family.FamilyId}/devices"))).EnumerateArray());
    }

    [Fact]
    public async Task The_other_parent_signs_in_with_their_own_password_and_sets_the_device_up_for_themselves()
    {
        var family = await FamilyAsync();
        using var _ = family;
        await SwitchAsync(family.Dad);
        Assert.Equal(HttpStatusCode.NoContent, (await family.Dad.LoginAsync(family.MomEmail)).StatusCode);
        // Mom on Dad's shared device: she isn't shown in his picker, and it isn't hers.
        var before = await JsonAsync(await family.Dad.GetAsync("/api/device/profiles"));
        Assert.Equal(["parent:Dad:True", "child:Kai:True"], Tiles(before));
        Assert.False(before.GetProperty("isYours").GetBoolean());

        var setUp = await family.Dad.PostAsync($"/api/families/{family.FamilyId}/devices/household", new { name = "Kitchen iPad", pin = "740361" });
        var picker = await JsonAsync(await family.Dad.GetAsync("/api/device/profiles"));

        Assert.Equal(HttpStatusCode.Created, setUp.StatusCode);
        Assert.Equal(["parent:Mom:True", "child:Kai:True"], Tiles(picker));
        Assert.True(picker.GetProperty("isYours").GetBoolean());
    }

    [Fact]
    public async Task Revoking_a_device_ends_its_parent_and_child_sessions_at_once_and_leaves_other_devices_alone()
    {
        var family = await FamilyAsync();
        using var _ = family;
        using var kidsTablet = await ApiSession.StartAsync(api);
        await kidsTablet.LoginAsync(family.DadEmail);
        await kidsTablet.PostAsync($"/api/families/{family.FamilyId}/devices/household", new { name = "Playroom tablet" });
        Assert.Equal(HttpStatusCode.NoContent, (await ChildSignInAsync(kidsTablet, family, KaisPin)).StatusCode);
        var kitchen = (await JsonAsync(await family.Mom.GetAsync($"/api/families/{family.FamilyId}/devices"))).EnumerateArray()
            .Single(d => d.GetProperty("name").GetString() == "Kitchen iPad").GetProperty("id").GetGuid();
        var playroom = (await JsonAsync(await family.Mom.GetAsync($"/api/families/{family.FamilyId}/devices"))).EnumerateArray()
            .Single(d => d.GetProperty("name").GetString() == "Playroom tablet").GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.NoContent, (await family.Mom.SendAsync(HttpMethod.Delete, $"/api/families/{family.FamilyId}/devices/{kitchen}")).StatusCode);

        // Dad's session on the kitchen iPad was bound to it: it's gone, and so is the picker.
        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await family.Dad.GetAsync("/api/device/profiles")).StatusCode);
        // Kai on the playroom tablet carries on.
        Assert.Equal(HttpStatusCode.OK, (await kidsTablet.GetAsync("/api/session/child")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await family.Mom.SendAsync(HttpMethod.Delete, $"/api/families/{family.FamilyId}/devices/{playroom}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await kidsTablet.GetAsync("/api/session/child")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await family.Mom.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task A_password_sign_in_on_the_shared_device_is_bound_to_it_too()
    {
        var family = await FamilyAsync();
        using var _ = family;
        await SwitchAsync(family.Dad);
        await family.Dad.LoginAsync(family.DadEmail);
        var device = Assert.Single((await JsonAsync(await family.Mom.GetAsync($"/api/families/{family.FamilyId}/devices"))).EnumerateArray());

        await family.Mom.SendAsync(HttpMethod.Delete, $"/api/families/{family.FamilyId}/devices/{device.GetProperty("id").GetGuid()}");

        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task The_picker_expires_30_days_after_setup_whatever_the_activity()
    {
        var family = await FamilyAsync();
        using var _ = family;

        api.Clock.Advance(TimeSpan.FromDays(29));
        await SwitchAsync(family.Dad);
        Assert.Equal(HttpStatusCode.NoContent, (await ParentPinAsync(family.Dad, family, DadsPin)).StatusCode);
        await SwitchAsync(family.Dad);
        Assert.Equal(HttpStatusCode.NoContent, (await ChildSignInAsync(family.Dad, family, KaisPin)).StatusCode);

        api.Clock.Advance(TimeSpan.FromDays(1));

        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/session/child")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await family.Dad.GetAsync("/api/device/profiles")).StatusCode);
        await family.Dad.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await ParentPinAsync(family.Dad, family, DadsPin)).StatusCode);
    }

    [Fact]
    public async Task A_parent_session_started_with_the_PIN_ends_when_the_device_expires()
    {
        var family = await FamilyAsync();
        using var _ = family;
        await SwitchAsync(family.Dad);
        await ParentPinAsync(family.Dad, family, DadsPin);
        Assert.Equal(HttpStatusCode.OK, (await family.Dad.GetAsync("/api/me")).StatusCode);

        api.Clock.Advance(TimeSpan.FromDays(30));

        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task When_the_parent_who_set_it_up_leaves_the_family_the_device_and_its_sessions_stop_working()
    {
        var family = await FamilyAsync();
        using var _ = family;
        Assert.Equal(HttpStatusCode.NoContent, (await ChildSignInAsync(family.Dad, family, KaisPin)).StatusCode);
        using var dadsPhone = await ApiSession.StartAsync(api);
        await dadsPhone.LoginAsync(family.DadEmail);

        Assert.Equal(HttpStatusCode.NoContent, (await dadsPhone.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);

        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/session/child")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await family.Dad.GetAsync("/api/device/profiles")).StatusCode);
    }

    [Fact]
    public async Task An_archived_childs_session_ends_and_they_leave_the_picker()
    {
        var family = await FamilyAsync();
        using var _ = family;
        using var tablet = await ApiSession.StartAsync(api);
        await tablet.LoginAsync(family.DadEmail);
        await tablet.PostAsync($"/api/families/{family.FamilyId}/devices/household", new { name = "Playroom tablet" });
        Assert.Equal(HttpStatusCode.NoContent, (await ChildSignInAsync(tablet, family, KaisPin)).StatusCode);

        var disabled = await family.Mom.SendAsync(HttpMethod.Delete, $"/api/families/{family.FamilyId}/children/{family.KaiId}/pin");

        Assert.Equal(HttpStatusCode.NoContent, disabled.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await tablet.GetAsync("/api/session/child")).StatusCode);
        Assert.Equal(["parent:Dad:True", "child:Kai:False"], Tiles(await JsonAsync(await family.Dad.GetAsync("/api/device/profiles"))));
    }

    [Fact]
    public async Task Pin_emails_use_the_configured_public_address_and_never_contain_a_token()
    {
        var family = await FamilyAsync();
        using var _ = family;
        await SwitchAsync(family.Dad);
        foreach (var pin in new[] { "111222", "111223", "111224" })
        {
            await ParentPinAsync(family.Dad, family, pin);
        }

        var link = family.Dad.Emails.LatestLink(family.DadEmail, "parent PIN is paused");

        Assert.Equal(new Uri($"{ApiFactory.PublicBaseUrl}/settings"), link);
    }

    // --- helpers -----------------------------------------------------------------------------------------------

    private static async Task SwitchAsync(ApiSession session)
    {
        await session.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await session.PostAsync("/api/device/switch")).StatusCode);
        await session.RefreshAntiforgeryAsync();
    }

    private static Task<HttpResponseMessage> ParentPinAsync(ApiSession session, TestFamily family, string pin) =>
        session.PostAsync("/api/device/parent-session", new { membershipId = family.DadMembershipId, pin });

    private static async Task<HttpResponseMessage> ChildSignInAsync(ApiSession session, TestFamily family, string pin)
    {
        var response = await session.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin });
        if (response.IsSuccessStatusCode)
        {
            await session.RefreshAntiforgeryAsync();
        }

        return response;
    }

    private static List<string> Tiles(JsonElement picker) => picker.GetProperty("profiles").EnumerateArray()
        .Select(p => $"{p.GetProperty("kind").GetString()}:{p.GetProperty("name").GetString()}:{p.GetProperty("canSignIn").GetBoolean()}")
        .ToList();

    private static async Task<Guid> MembershipIdAsync(ApiSession parent, Guid familyId)
    {
        var details = await JsonAsync(await parent.GetAsync($"/api/families/{familyId}"));
        return details.GetProperty("members").EnumerateArray().Single(m => m.GetProperty("isYou").GetBoolean()).GetProperty("membershipId").GetGuid();
    }

    /// <summary>Dad and Mom with Kai approved by both and Kai's PIN set; optionally Dad's browser set up as a shared device.</summary>
    private async Task<TestFamily> FamilyAsync(bool sharedDevice = true)
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
        var kaiId = kai.GetProperty("id").GetGuid();
        Assert.Equal(
            HttpStatusCode.NoContent,
            (await dad.SendAsync(HttpMethod.Put, $"/api/families/{familyId}/children/{kaiId}/pin", new { pin = KaisPin })).StatusCode);
        if (sharedDevice)
        {
            Assert.Equal(
                HttpStatusCode.Created,
                (await dad.PostAsync($"/api/families/{familyId}/devices/household", new { name = "Kitchen iPad", pin = DadsPin })).StatusCode);
        }

        return new TestFamily(dad, mom, familyId, kaiId, await MembershipIdAsync(dad, familyId), dadEmail, momEmail);
    }

    private sealed record TestFamily(
        ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId, Guid DadMembershipId, string DadEmail, string MomEmail) : IDisposable
    {
        public void Dispose()
        {
            Dad.Dispose();
            Mom.Dispose();
        }
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
