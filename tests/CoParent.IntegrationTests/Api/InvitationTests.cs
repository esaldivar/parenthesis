using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Co-parent invitations (FM-03, ADR-0006).</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class InvitationTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Someone_without_an_account_is_invited_to_sign_up_and_join()
    {
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var mom = ApiSession.NewEmail();

        var response = await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = mom });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var email = Assert.Single(dad.Emails.SentTo(mom));
        Assert.Equal("Dad invited you to Parenthesis", email.Subject);
        var link = dad.Emails.LatestLink(mom, "invited");
        Assert.Equal("/register", link.AbsolutePath);
        Assert.False(string.IsNullOrEmpty(TokenFrom(link)));
    }

    [Fact]
    public async Task Someone_with_an_account_is_invited_to_join_and_the_inviter_cannot_tell_the_difference()
    {
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var momEmail = ApiSession.NewEmail();
        using var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        var stranger = ApiSession.NewEmail();

        var toExisting = await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var toNew = await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = stranger });

        Assert.Equal(toNew.StatusCode, toExisting.StatusCode);
        Assert.Equal(
            (await JsonAsync(toNew)).EnumerateObject().Select(p => p.Name),
            (await JsonAsync(toExisting)).EnumerateObject().Select(p => p.Name));
        var email = dad.Emails.SentTo(momEmail)[^1];
        Assert.Equal("Dad invited you to join Rivera Family on Parenthesis", email.Subject);
        Assert.Equal("/invitations/accept", dad.Emails.LatestLink(momEmail, "invited").AbsolutePath);
    }

    [Fact]
    public async Task The_invitee_accepts_and_both_are_equal_parents()
    {
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = TokenFrom(dad.Emails.LatestLink(momEmail, "invited"));
        using var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);

        var accepted = await mom.PostAsync("/api/invitations/accept", new { token });
        var family = await JsonAsync(await mom.GetAsync($"/api/families/{familyId}"));

        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal(
            ["Dad", "Mom"],
            family.GetProperty("members").EnumerateArray().Select(m => m.GetProperty("displayName").GetString()));
        Assert.All(family.GetProperty("members").EnumerateArray(), m => Assert.Equal("Parent", m.GetProperty("role").GetString()));
        Assert.Empty((await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/invitations"))).EnumerateArray());
    }

    [Fact]
    public async Task Only_the_invited_email_address_can_accept()
    {
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = TokenFrom(dad.Emails.LatestLink(momEmail, "invited"));
        using var someoneElse = await ApiSession.SignedInAsync(api);

        var response = await someoneElse.PostAsync("/api/invitations/accept", new { token });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await someoneElse.GetAsync($"/api/families/{familyId}")).StatusCode);
    }

    [Fact]
    public async Task An_invitation_works_once_and_a_new_one_replaces_the_old_link()
    {
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var oldToken = TokenFrom(dad.Emails.LatestLink(momEmail, "invited"));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var newToken = TokenFrom(dad.Emails.LatestLink(momEmail, "invited"));
        using var mom = await ApiSession.SignedInAsync(api, email: momEmail);

        var withOld = await mom.PostAsync("/api/invitations/accept", new { token = oldToken });
        var withNew = await mom.PostAsync("/api/invitations/accept", new { token = newToken });
        var again = await mom.PostAsync("/api/invitations/accept", new { token = newToken });

        Assert.Equal(HttpStatusCode.NotFound, withOld.StatusCode);
        Assert.Equal(HttpStatusCode.OK, withNew.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
    }

    [Fact]
    public async Task A_revoked_invitation_can_no_longer_be_accepted()
    {
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();
        var sent = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail }));
        var token = TokenFrom(dad.Emails.LatestLink(momEmail, "invited"));

        var revoked = await dad.SendAsync(HttpMethod.Delete, $"/api/families/{familyId}/invitations/{sent.GetProperty("id").GetGuid()}");
        using var mom = await ApiSession.SignedInAsync(api, email: momEmail);
        var accepted = await mom.PostAsync("/api/invitations/accept", new { token });

        Assert.Equal(HttpStatusCode.NoContent, revoked.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, accepted.StatusCode);
    }

    [Fact]
    public async Task Families_are_never_merged_a_parent_with_a_family_must_confirm_it_is_a_separate_one()
    {
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api);
        var dadsFamily = await dad.CreateFamilyAsync("Dad's setup");
        using var mom = await ApiSession.SignedInAsync(api, email: momEmail);
        await mom.CreateFamilyAsync("Mom's setup");
        await dad.PostAsync($"/api/families/{dadsFamily}/invitations", new { email = momEmail });
        var token = TokenFrom(dad.Emails.LatestLink(momEmail, "invited"));

        var blocked = await mom.PostAsync("/api/invitations/accept", new { token });
        var confirmed = await mom.PostAsync("/api/invitations/accept", new { token, confirmSeparateFamily = true });
        var mine = await JsonAsync(await mom.GetAsync("/api/me/families"));

        Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode);
        Assert.Equal("https://parenthesis.app/problems/existing-family", (await JsonAsync(blocked)).GetProperty("type").GetString());
        Assert.Equal(HttpStatusCode.OK, confirmed.StatusCode);
        Assert.Equal(2, mine.GetArrayLength()); // Two separate families, nothing combined.
    }

    [Fact]
    public async Task A_family_with_two_parents_cannot_invite_a_third()
    {
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        using var mom = await ApiSession.SignedInAsync(api, email: momEmail);
        await mom.PostAsync("/api/invitations/accept", new { token = TokenFrom(dad.Emails.LatestLink(momEmail, "invited")) });

        var third = await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = ApiSession.NewEmail() });

        Assert.Equal(HttpStatusCode.Conflict, third.StatusCode);
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("")]
    public async Task Invalid_addresses_are_rejected(string email)
    {
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();

        var response = await dad.PostAsync($"/api/families/{familyId}/invitations", new { email });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty("email", out _));
    }

    [Fact]
    public async Task You_cannot_invite_your_own_address()
    {
        var dadEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api, email: dadEmail);
        var familyId = await dad.CreateFamilyAsync();

        var response = await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = dadEmail.ToUpperInvariant() });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Outsiders_cannot_see_or_send_a_familys_invitations()
    {
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();
        using var outsider = await ApiSession.SignedInAsync(api);

        var list = await outsider.GetAsync($"/api/families/{familyId}/invitations");
        var send = await outsider.PostAsync($"/api/families/{familyId}/invitations", new { email = ApiSession.NewEmail() });

        Assert.Equal(HttpStatusCode.NotFound, list.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, send.StatusCode);
    }

    private static string TokenFrom(Uri link) => QueryHelpers.ParseQuery(link.Query)["token"].ToString();

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
