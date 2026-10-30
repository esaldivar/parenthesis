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
        Assert.Equal(
            ["Mom"],
            family.GetProperty("members").EnumerateArray().Where(m => m.GetProperty("isYou").GetBoolean()).Select(m => m.GetProperty("displayName").GetString()));
        Assert.Empty((await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/invitations"))).EnumerateArray());
    }

    [Fact]
    public async Task Parent_palette_slots_survive_departures_and_replacement_invitations()
    {
        using var founder = await ApiSession.SignedInAsync(api, displayName: "Alex");
        var familyId = await founder.CreateFamilyAsync();
        var invitedEmail = ApiSession.NewEmail();
        await founder.PostAsync($"/api/families/{familyId}/invitations", new { email = invitedEmail });
        var token = TokenFrom(founder.Emails.LatestLink(invitedEmail, "invited"));
        using var invited = await ApiSession.SignedInAsync(api, displayName: "Sam", email: invitedEmail);
        Assert.Equal(HttpStatusCode.OK, (await invited.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        var before = await JsonAsync(await invited.GetAsync($"/api/families/{familyId}"));
        Assert.Equal([0, 1], before.GetProperty("members").EnumerateArray().Select(m => m.GetProperty("paletteSlot").GetInt32()));

        Assert.Equal(HttpStatusCode.NoContent, (await founder.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);
        var remaining = await JsonAsync(await invited.GetAsync($"/api/families/{familyId}"));
        Assert.Equal(1, Assert.Single(remaining.GetProperty("members").EnumerateArray()).GetProperty("paletteSlot").GetInt32());

        var replacementEmail = ApiSession.NewEmail();
        await invited.PostAsync($"/api/families/{familyId}/invitations", new { email = replacementEmail });
        var replacementToken = TokenFrom(invited.Emails.LatestLink(replacementEmail, "invited"));
        using var replacement = await ApiSession.SignedInAsync(api, displayName: "Taylor", email: replacementEmail);
        Assert.Equal(HttpStatusCode.OK, (await replacement.PostAsync("/api/invitations/accept", new { token = replacementToken })).StatusCode);
        foreach (var viewer in new[] { invited, replacement })
        {
            var family = await JsonAsync(await viewer.GetAsync($"/api/families/{familyId}"));
            var members = family.GetProperty("members").EnumerateArray().ToArray();
            Assert.Equal(1, members.Single(m => m.GetProperty("displayName").GetString() == "Sam").GetProperty("paletteSlot").GetInt32());
            Assert.Equal(0, members.Single(m => m.GetProperty("displayName").GetString() == "Taylor").GetProperty("paletteSlot").GetInt32());
        }
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

    // Issue #211: an invited co-parent must join the existing family, never end up with a second one.
    [Fact]
    public async Task A_new_account_made_for_the_invitation_joins_the_existing_family_and_creates_none()
    {
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var link = dad.Emails.LatestLink(momEmail, "invited");

        // One device, as in the browser: register from the "Sign up to join" link, confirm from the email, sign in, accept.
        using var mom = await ApiSession.StartAsync(api);
        await mom.RegisterConfirmedAsync(momEmail, displayName: "Mom");
        Assert.Equal(HttpStatusCode.NoContent, (await mom.LoginAsync(momEmail)).StatusCode);
        var beforeAccepting = await JsonAsync(await mom.GetAsync("/api/me/families"));
        var accepted = await mom.PostAsync("/api/invitations/accept", new { token = TokenFrom(link) });

        Assert.Equal("/register", link.AbsolutePath);
        Assert.Empty(beforeAccepting.EnumerateArray());
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var families = (await JsonAsync(await mom.GetAsync("/api/me/families"))).EnumerateArray().ToList();
        Assert.Equal([familyId], families.Select(f => f.GetProperty("id").GetGuid()));
        Assert.Equal([familyId], (await JsonAsync(await dad.GetAsync("/api/me/families"))).EnumerateArray().Select(f => f.GetProperty("id").GetGuid()));
        // Kai, added by Dad, is the same child for Mom, waiting for her approval (ADR-0006): nothing to recreate.
        var children = (await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/children"))).EnumerateArray().ToList();
        Assert.Equal([kai.GetProperty("id").GetGuid()], children.Select(c => c.GetProperty("id").GetGuid()));
        Assert.Equal("PendingApproval", children[0].GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_wrong_account_does_not_use_up_the_invitation_and_answering_twice_changes_nothing()
    {
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync();
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = TokenFrom(dad.Emails.LatestLink(momEmail, "invited"));
        using var someoneElse = await ApiSession.SignedInAsync(api);
        using var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);

        var wrong = await someoneElse.PostAsync("/api/invitations/accept", new { token });
        // A double tap: the same request twice at once.
        var answers = await Task.WhenAll(
            mom.PostAsync("/api/invitations/accept", new { token }),
            mom.PostAsync("/api/invitations/accept", new { token }));

        Assert.Equal(HttpStatusCode.Forbidden, wrong.StatusCode);
        Assert.Empty((await JsonAsync(await someoneElse.GetAsync("/api/me/families"))).EnumerateArray());
        Assert.Single(answers, a => a.StatusCode == HttpStatusCode.OK);
        Assert.All(answers.Where(a => a.StatusCode != HttpStatusCode.OK), a => Assert.True((int)a.StatusCode is 404 or 409, a.StatusCode.ToString()));
        Assert.Equal([familyId], (await JsonAsync(await mom.GetAsync("/api/me/families"))).EnumerateArray().Select(f => f.GetProperty("id").GetGuid()));
        Assert.Equal(2, (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"))).GetProperty("members").GetArrayLength());
    }

    [Fact]
    public async Task On_an_invite_only_site_an_invited_co_parent_must_still_be_listed()
    {
        var dadEmail = ApiSession.NewEmail();
        var listed = ApiSession.NewEmail();
        var unlisted = ApiSession.NewEmail();
        await using var inviteOnly = api.WithWebHostBuilder(b => b
            .UseSetting("Identity:SignUp:InviteOnly", "true")
            .UseSetting("Identity:SignUp:AllowedEmails", $"{dadEmail},{listed}"));
        using var dad = await ApiSession.SignedInAsync(inviteOnly, displayName: "Dad", email: dadEmail);
        var familyId = await dad.CreateFamilyAsync();
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = unlisted });
        using var stranger = await ApiSession.StartAsync(inviteOnly);

        // An invitation isn't a way past the tester list.
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.RegisterAsync(unlisted)).StatusCode);

        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = listed });
        var token = TokenFrom(dad.Emails.LatestLink(listed, "invited"));
        using var mom = await ApiSession.SignedInAsync(inviteOnly, displayName: "Mom", email: listed);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
    }

    private static string TokenFrom(Uri link) => QueryHelpers.ParseQuery(link.Query)["token"].ToString();

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
