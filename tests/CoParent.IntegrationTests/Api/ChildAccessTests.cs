using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Devices, the profile picker, child PINs and lockout (A-08 to A-10, ADR-0006 as changed by #153).</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ChildAccessTests(ApiFactory api) : IAsyncLifetime
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
    public async Task A_household_device_shows_only_the_parent_who_registered_it_and_the_child()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;

        var picker = await JsonAsync(await family.Dad.GetAsync("/api/device/profiles"));

        Assert.Equal("Rivera Family", picker.GetProperty("familyName").GetString());
        Assert.Equal(
            ["parent:Dad", "child:Kai"],
            picker.GetProperty("profiles").EnumerateArray().Select(p => $"{p.GetProperty("kind").GetString()}:{p.GetProperty("name").GetString()}"));
        var kai = picker.GetProperty("profiles").EnumerateArray().Last();
        Assert.True(kai.GetProperty("canSignIn").GetBoolean());
        Assert.False(kai.GetProperty("locked").GetBoolean());
    }

    [Fact]
    public async Task Each_parents_device_shows_only_that_parent()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        Assert.Equal(
            HttpStatusCode.Created,
            (await family.Mom.PostAsync($"/api/families/{family.FamilyId}/devices/household", new { name = "Mom's phone", pin = "740361" })).StatusCode);

        var picker = await JsonAsync(await family.Mom.GetAsync("/api/device/profiles"));

        Assert.Equal(
            ["parent:Mom", "child:Kai"],
            picker.GetProperty("profiles").EnumerateArray().Select(p => $"{p.GetProperty("kind").GetString()}:{p.GetProperty("name").GetString()}"));
    }

    [Fact]
    public async Task A_PIN_only_works_on_a_registered_device()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        using var unregistered = await ApiSession.StartAsync(api);

        var picker = await unregistered.GetAsync("/api/device/profiles");
        var signIn = await unregistered.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });

        Assert.Equal(HttpStatusCode.NotFound, picker.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, signIn.StatusCode);
    }

    [Fact]
    public async Task The_child_signs_in_with_their_PIN_and_can_only_reach_child_safe_endpoints()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;

        var signIn = await family.Dad.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });
        var whoAmI = await JsonAsync(await family.Dad.GetAsync("/api/session/child"));

        Assert.Equal(HttpStatusCode.NoContent, signIn.StatusCode);
        Assert.Equal("Kai", whoAmI.GetProperty("firstName").GetString());

        // The parent's session on this device is gone, and parent-only endpoints refuse the child.
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.GetAsync("/api/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.GetAsync("/api/me/families")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.GetAsync($"/api/families/{family.FamilyId}/approvals")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.PostAsync("/api/families", new { name = "Kai's family", timeZone = "UTC" })).StatusCode);
        // Reminders and tasks are parents only (owner decisions, October 22, 2026; #170, #174).
        var week = "from=2026-10-12T00:00:00Z&to=2026-10-19T00:00:00Z";
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.GetAsync($"/api/families/{family.FamilyId}/calendar/reminders?{week}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.GetAsync($"/api/families/{family.FamilyId}/calendar/tasks?from=2026-10-12&to=2026-10-19")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await family.Dad.PostAsync($"/api/families/{family.FamilyId}/calendar/tasks", new { title = "Kai's task", dueDate = "2026-10-16" })).StatusCode);

        // Back to a parent profile only with the parent's full password. Antiforgery tokens are tied to who is signed
        // in, so the app fetches a fresh one whenever the profile changes.
        await family.Dad.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await family.Dad.LoginAsync(family.DadEmail)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await family.Dad.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Three_wrong_PINs_pause_the_childs_PIN_three_more_lock_it_and_only_the_lock_emails_both_parents()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        var device = family.Dad;

        var first = await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1357" });
        await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1358" });
        var third = await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1359" });
        var rightDuringPause = await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });

        Assert.Equal(HttpStatusCode.Unauthorized, first.StatusCode);
        Assert.Equal(2, (await JsonAsync(first)).GetProperty("triesLeft").GetInt32());
        Assert.Equal((HttpStatusCode)423, third.StatusCode);
        var paused = await JsonAsync(third);
        Assert.Equal("paused", paused.GetProperty("state").GetString());
        var retryAt = paused.GetProperty("retryAt").GetDateTimeOffset();
        Assert.InRange(retryAt - api.Clock.GetUtcNow(), TimeSpan.FromMinutes(9), TimeSpan.FromMinutes(10));
        Assert.False(paused.TryGetProperty("notified", out var notified), $"notified: {notified}");
        // A pause can't be skipped with the right PIN, and the first pause emails nobody.
        Assert.Equal((HttpStatusCode)423, rightDuringPause.StatusCode);
        Assert.DoesNotContain(device.Emails.SentTo(family.DadEmail), m => m.Subject.Contains("PIN", StringComparison.Ordinal));
        Assert.DoesNotContain(device.Emails.SentTo(family.MomEmail), m => m.Subject.Contains("PIN", StringComparison.Ordinal));

        api.Clock.Advance(TimeSpan.FromMinutes(10));
        await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1360" });
        await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1361" });
        var sixth = await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1362" });
        var rightButLocked = await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });

        Assert.Equal((HttpStatusCode)423, sixth.StatusCode);
        var locked = await JsonAsync(sixth);
        Assert.Equal("locked", locked.GetProperty("state").GetString());
        Assert.True(locked.GetProperty("notified").GetBoolean());
        Assert.Equal((HttpStatusCode)423, rightButLocked.StatusCode);
        var dadsLockEmail = Assert.Single(device.Emails.SentTo(family.DadEmail), m => m.Subject == "A child's PIN is locked");
        Assert.Single(device.Emails.SentTo(family.MomEmail), m => m.Subject == "A child's PIN is locked");
        Assert.Contains("Kai", dadsLockEmail.TextBody, StringComparison.Ordinal);
        Assert.DoesNotContain(KaisPin, dadsLockEmail.TextBody, StringComparison.Ordinal);
        Assert.DoesNotContain(KaisPin, dadsLockEmail.HtmlBody, StringComparison.Ordinal);

        // Either parent resets it through their own account: at once, no approval, and the lock is gone.
        var reset = await family.Mom.SendAsync(HttpMethod.Put, $"/api/families/{family.FamilyId}/children/{family.KaiId}/pin", new { pin = "4826" });
        var oldPin = await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });
        var newPin = await device.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "4826" });

        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, oldPin.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, newPin.StatusCode);
    }

    [Fact]
    public async Task A_right_PIN_clears_earlier_failures_and_the_earlier_pause()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        using var tablet = await PairedTabletAsync(family);

        foreach (var pin in new[] { "1357", "1358", "1359" })
        {
            await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin });
        }

        api.Clock.Advance(TimeSpan.FromMinutes(11));
        Assert.Equal(HttpStatusCode.NoContent, (await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin })).StatusCode);
        await tablet.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await tablet.SendAsync(HttpMethod.Post, "/api/device/switch")).StatusCode);
        await tablet.RefreshAntiforgeryAsync();

        // Back to a fresh first round: three more wrong PINs pause again rather than lock.
        await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1357" });
        await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1358" });
        var third = await JsonAsync(await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1359" }));

        Assert.Equal("paused", third.GetProperty("state").GetString());
    }

    [Fact]
    public async Task A_malformed_PIN_is_rejected_without_counting_as_a_try()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;

        foreach (var pin in new[] { "12", "abcd", "1234567", "", "12 34" })
        {
            Assert.Equal(
                HttpStatusCode.BadRequest,
                (await family.Dad.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin })).StatusCode);
        }

        var wrong = await family.Dad.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1357" });
        Assert.Equal(2, (await JsonAsync(wrong)).GetProperty("triesLeft").GetInt32());
    }

    [Fact]
    public async Task Removing_the_device_ends_the_childs_session_at_once()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        await family.Dad.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });
        var device = Assert.Single((await JsonAsync(await family.Mom.GetAsync($"/api/families/{family.FamilyId}/devices"))).EnumerateArray());

        var revoked = await family.Mom.SendAsync(HttpMethod.Delete, $"/api/families/{family.FamilyId}/devices/{device.GetProperty("id").GetGuid()}");
        var kidAfter = await family.Dad.GetAsync("/api/session/child");

        Assert.Equal(HttpStatusCode.NoContent, revoked.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, kidAfter.StatusCode);
    }

    [Fact]
    public async Task Disabling_a_childs_sign_in_ends_their_session_at_once()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        await family.Dad.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });

        var disabled = await family.Mom.SendAsync(HttpMethod.Delete, $"/api/families/{family.FamilyId}/children/{family.KaiId}/pin");

        Assert.Equal(HttpStatusCode.NoContent, disabled.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/session/child")).StatusCode);
    }

    [Theory]
    [InlineData("123")]
    [InlineData("1234567")]
    [InlineData("12a4")]
    [InlineData("0000")]
    [InlineData("1234")]
    [InlineData("9876")]
    public async Task Weak_or_malformed_PINs_are_rejected(string pin)
    {
        var family = await FamilyWithKaiAsync(setPin: false);
        using var _ = family;

        var response = await family.Dad.SendAsync(HttpMethod.Put, $"/api/families/{family.FamilyId}/children/{family.KaiId}/pin", new { pin });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_PIN_can_only_be_set_for_an_approved_child()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        var pending = await JsonAsync(await family.Dad.PostAsync($"/api/families/{family.FamilyId}/children", new { firstName = "Aurora" }));

        var forPending = await family.Dad.SendAsync(
            HttpMethod.Put, $"/api/families/{family.FamilyId}/children/{pending.GetProperty("id").GetGuid()}/pin", new { pin = "4826" });

        Assert.Equal(HttpStatusCode.NotFound, forPending.StatusCode);
    }

    [Fact]
    public async Task Either_parent_resets_a_childs_PIN_at_once_and_only_the_other_parent_is_told_without_the_PIN()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        using var tablet = await PairedTabletAsync(family);

        var reset = await family.Dad.SendAsync(HttpMethod.Put, $"/api/families/{family.FamilyId}/children/{family.KaiId}/pin", new { pin = "4826" });
        var oldPin = await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });
        var newPin = await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "4826" });

        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, oldPin.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, newPin.StatusCode);
        var notice = Assert.Single(tablet.Emails.SentTo(family.MomEmail), m => m.Subject == "A child's PIN was reset");
        Assert.Contains("Dad set a new PIN for Kai", notice.TextBody, StringComparison.Ordinal);
        Assert.DoesNotContain("4826", notice.TextBody, StringComparison.Ordinal);
        Assert.DoesNotContain("4826", notice.HtmlBody, StringComparison.Ordinal);
        Assert.DoesNotContain(tablet.Emails.SentTo(family.DadEmail), m => m.Subject == "A child's PIN was reset");
    }

    [Fact]
    public async Task Parents_see_each_childs_sign_in_state()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        using var tablet = await PairedTabletAsync(family);
        await family.Dad.PostAsync($"/api/families/{family.FamilyId}/children", new { firstName = "Aurora" });

        var before = await ChildrenSignInAsync(family);
        foreach (var pin in new[] { "1357", "1358", "1359" })
        {
            await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin });
        }

        var paused = await ChildrenSignInAsync(family);
        api.Clock.Advance(TimeSpan.FromMinutes(10));
        foreach (var pin in new[] { "1357", "1358", "1359" })
        {
            await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin });
        }

        var locked = await ChildrenSignInAsync(family);

        Assert.Equal(["Kai:True:False:False:False", "Aurora:False:False:False:False"], before);
        Assert.Equal(["Kai:True:False:False:True", "Aurora:False:False:False:False"], paused);
        Assert.Equal(["Kai:True:True:False:False", "Aurora:False:False:False:False"], locked);
    }

    /// <summary>Each child as "name:enabled:locked:pinChangePending:paused", as Mom's children list shows it.</summary>
    private static async Task<List<string>> ChildrenSignInAsync(TestFamily family) =>
        (await JsonAsync(await family.Mom.GetAsync($"/api/families/{family.FamilyId}/children")))
            .EnumerateArray()
            .Select(c =>
            {
                var signIn = c.GetProperty("signIn");
                return $"{c.GetProperty("firstName").GetString()}:{signIn.GetProperty("enabled").GetBoolean()}"
                    + $":{signIn.GetProperty("locked").GetBoolean()}:{signIn.GetProperty("pinChangePending").GetBoolean()}"
                    + $":{signIn.GetProperty("pausedUntil").ValueKind != JsonValueKind.Null}";
            })
            .ToList();

    private async Task<ApiSession> PairedTabletAsync(TestFamily family)
    {
        var tablet = await ApiSession.StartAsync(api);
        var code = await PairingCodeAsync(family);
        Assert.Equal(HttpStatusCode.OK, (await tablet.PostAsync("/api/device/pair", new { code, deviceName = "Kai's tablet" })).StatusCode);
        await tablet.RefreshAntiforgeryAsync();
        return tablet;
    }

    [Fact]
    public async Task A_paired_tablet_belongs_to_one_child_only()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        var code = (await JsonAsync(await family.Mom.PostAsync($"/api/families/{family.FamilyId}/children/{family.KaiId}/pairing-code")))
            .GetProperty("code").GetString()!;
        using var tablet = await ApiSession.StartAsync(api);

        var paired = await tablet.PostAsync("/api/device/pair", new { code = code.ToLowerInvariant(), deviceName = "Kai's tablet" });
        var picker = await JsonAsync(await tablet.GetAsync("/api/device/profiles"));
        await tablet.RefreshAntiforgeryAsync();
        var signIn = await tablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });

        Assert.Equal(HttpStatusCode.OK, paired.StatusCode);
        Assert.Equal("Kai", (await JsonAsync(paired)).GetProperty("childFirstName").GetString());
        Assert.Equal("ChildPaired", picker.GetProperty("deviceKind").GetString());
        Assert.Equal(["child:Kai"], picker.GetProperty("profiles").EnumerateArray()
            .Select(p => $"{p.GetProperty("kind").GetString()}:{p.GetProperty("name").GetString()}"));
        Assert.Equal(HttpStatusCode.NoContent, signIn.StatusCode);
        var devices = (await JsonAsync(await family.Mom.GetAsync($"/api/families/{family.FamilyId}/devices"))).EnumerateArray();
        Assert.Contains(devices, d => d.GetProperty("name").GetString() == "Kai's tablet" && d.GetProperty("kind").GetString() == "ChildPaired");
    }

    [Fact]
    public async Task A_pairing_code_works_once_and_a_new_code_replaces_the_old_one()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        var first = await PairingCodeAsync(family);
        var second = await PairingCodeAsync(family);
        using var tabletA = await ApiSession.StartAsync(api);
        using var tabletB = await ApiSession.StartAsync(api);

        var withReplaced = await tabletA.PostAsync("/api/device/pair", new { code = first, deviceName = "Tablet A" });
        var withCurrent = await tabletA.PostAsync("/api/device/pair", new { code = second, deviceName = "Tablet A" });
        var reused = await tabletB.PostAsync("/api/device/pair", new { code = second, deviceName = "Tablet B" });

        Assert.Equal(HttpStatusCode.NotFound, withReplaced.StatusCode);
        Assert.Equal(HttpStatusCode.OK, withCurrent.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, reused.StatusCode);
    }

    [Fact]
    public async Task Pairing_ends_any_parent_session_on_the_tablet()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        var code = await PairingCodeAsync(family);

        await family.Dad.PostAsync("/api/device/pair", new { code, deviceName = "Old family laptop" });

        Assert.Equal(HttpStatusCode.Unauthorized, (await family.Dad.GetAsync("/api/me")).StatusCode);
    }

    private static async Task<string> PairingCodeAsync(TestFamily family) =>
        (await JsonAsync(await family.Mom.PostAsync($"/api/families/{family.FamilyId}/children/{family.KaiId}/pairing-code")))
            .GetProperty("code").GetString()!;

    /// <summary>Dad and Mom, with Kai approved by both, Kai's PIN set, and Dad's browser set up as a shared device.</summary>
    private async Task<TestFamily> FamilyWithKaiAsync(bool setPin = true)
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
        if (setPin)
        {
            Assert.Equal(
                HttpStatusCode.NoContent,
                (await dad.SendAsync(HttpMethod.Put, $"/api/families/{familyId}/children/{kaiId}/pin", new { pin = KaisPin })).StatusCode);
        }

        Assert.Equal(
            HttpStatusCode.Created,
            (await dad.PostAsync($"/api/families/{familyId}/devices/household", new { name = "Kitchen iPad", pin = DadsPin })).StatusCode);
        return new TestFamily(dad, mom, familyId, kaiId, dadEmail, momEmail);
    }

    private sealed record TestFamily(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId, string DadEmail, string MomEmail)
        : IDisposable
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
