using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Devices, the profile picker, child PINs and lockout (A-08 to A-10, ADR-0006).</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ChildAccessTests(ApiFactory api) : IAsyncLifetime
{
    private const string KaisPin = "2580";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task A_registered_household_device_shows_both_parents_and_the_child()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;

        var picker = await JsonAsync(await family.Dad.GetAsync("/api/device/profiles"));

        Assert.Equal("Rivera Family", picker.GetProperty("familyName").GetString());
        Assert.Equal(
            ["parent:Dad", "parent:Mom", "child:Kai"],
            picker.GetProperty("profiles").EnumerateArray().Select(p => $"{p.GetProperty("kind").GetString()}:{p.GetProperty("name").GetString()}"));
        var kai = picker.GetProperty("profiles").EnumerateArray().Last();
        Assert.True(kai.GetProperty("canSignIn").GetBoolean());
        Assert.False(kai.GetProperty("locked").GetBoolean());
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

        // Back to a parent profile only with the parent's full password. Antiforgery tokens are tied to who is signed
        // in, so the app fetches a fresh one whenever the profile changes.
        await family.Dad.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await family.Dad.LoginAsync(family.DadEmail)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await family.Dad.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Three_wrong_PINs_lock_the_profile_and_email_both_parents_until_a_parent_unlocks_it()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        var kidsTablet = family.Dad;

        var first = await kidsTablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1357" });
        var second = await kidsTablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1358" });
        var third = await kidsTablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = "1359" });
        var rightButLocked = await kidsTablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });

        Assert.Equal(HttpStatusCode.Unauthorized, first.StatusCode);
        Assert.Equal(2, (await JsonAsync(first)).GetProperty("triesLeft").GetInt32());
        Assert.Equal(HttpStatusCode.Unauthorized, second.StatusCode);
        Assert.Equal((HttpStatusCode)423, third.StatusCode);
        Assert.Equal((HttpStatusCode)423, rightButLocked.StatusCode);
        Assert.Contains(kidsTablet.Emails.SentTo(family.DadEmail), m => m.Subject == "Kai's profile is locked");
        Assert.Contains(kidsTablet.Emails.SentTo(family.MomEmail), m => m.Subject == "Kai's profile is locked");

        var unlocked = await family.Mom.PostAsync($"/api/families/{family.FamilyId}/children/{family.KaiId}/unlock");
        var afterUnlock = await kidsTablet.PostAsync("/api/device/child-session", new { childId = family.KaiId, pin = KaisPin });

        Assert.Equal(HttpStatusCode.NoContent, unlocked.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, afterUnlock.StatusCode);
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
    public async Task A_PIN_is_set_once_and_only_for_an_approved_child()
    {
        var family = await FamilyWithKaiAsync();
        using var _ = family;
        var pending = await JsonAsync(await family.Dad.PostAsync($"/api/families/{family.FamilyId}/children", new { firstName = "Aurora" }));

        var forPending = await family.Dad.SendAsync(
            HttpMethod.Put, $"/api/families/{family.FamilyId}/children/{pending.GetProperty("id").GetGuid()}/pin", new { pin = "4826" });
        var change = await family.Dad.SendAsync(
            HttpMethod.Put, $"/api/families/{family.FamilyId}/children/{family.KaiId}/pin", new { pin = "4826" });

        Assert.Equal(HttpStatusCode.NotFound, forPending.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, change.StatusCode);
    }

    /// <summary>Dad and Mom, with Kai approved by both, Kai's PIN set, and Dad's browser registered as a household device.</summary>
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
            (await dad.PostAsync($"/api/families/{familyId}/devices/household", new { name = "Kitchen iPad" })).StatusCode);
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
