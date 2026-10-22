using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>A parent deletes their own account (A-12; owner decisions, October 20, 2026).</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AccountDeletionTests(ApiFactory api) : IAsyncLifetime
{
    private static readonly DateTimeOffset _monday = new(2026, 10, 12, 0, 0, 0, TimeSpan.FromHours(-5));

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task A_wrong_password_deletes_nothing()
    {
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        await dad.CreateFamilyAsync();

        var response = await dad.PostAsync("/api/me/delete", new { password = "not my password at all" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty("password", out _));
        Assert.Equal(HttpStatusCode.OK, (await dad.GetAsync("/api/me")).StatusCode);
        Assert.Single((await JsonAsync(await dad.GetAsync("/api/me/families"))).EnumerateArray());
    }

    [Fact]
    public async Task Deleting_needs_the_antiforgery_token()
    {
        using var dad = await ApiSession.SignedInAsync(api);

        var response = await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password }, withAntiforgery: false);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await dad.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task The_only_parent_deletes_their_account_and_the_family_goes_too_and_the_email_can_sign_up_again()
    {
        var email = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad", email: email);
        var familyId = await dad.CreateFamilyAsync();
        await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" });
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = ApiSession.NewEmail() });
        await dad.PostAsync(Events(familyId), new { category = "Unavailable", startsAt = _monday, endsAt = _monday.AddHours(2) });

        var response = await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await dad.GetAsync("/api/me")).StatusCode);
        Assert.Equal(0L, await CountAsync("identity.users", "normalized_email", email.ToUpperInvariant()));
        Assert.Equal(0L, await CountAsync("families.families", "id", familyId));
        Assert.Equal(0L, await CountAsync("families.child_profiles", "family_id", familyId));
        Assert.Equal(0L, await CountAsync("families.invitations", "family_id", familyId));
        Assert.Equal(0L, await CountAsync("families.memberships", "family_id", familyId));
        Assert.Equal(0L, await CountAsync("calendar.events", "family_id", familyId));
        Assert.Equal(0L, await CountAsync("approvals.change_requests", "family_id", familyId));
        Assert.Equal("Your Parenthesis account has been deleted", dad.Emails.SentTo(email)[^1].Subject);

        // The owner's reason for A-12: the same address can go through sign-up again.
        using var again = await ApiSession.StartAsync(api);
        await again.RegisterConfirmedAsync(email, displayName: "Dad");
        Assert.Equal(HttpStatusCode.NoContent, (await again.LoginAsync(email)).StatusCode);
        Assert.Empty((await JsonAsync(await again.GetAsync("/api/me/families"))).EnumerateArray());
    }

    [Fact]
    public async Task With_a_co_parent_the_family_children_and_shared_history_stay_with_them()
    {
        var (dad, mom, momEmail, familyId, kaiId) = await TwoParentFamilyAsync();
        using (dad)
        using (mom)
        {
            var momMembership = (await JsonAsync(await mom.GetAsync($"/api/families/{familyId}"))).GetProperty("members")
                .EnumerateArray().Single(m => m.GetProperty("displayName").GetString() == "Mom").GetProperty("membershipId").GetGuid();
            var soccer = await JsonAsync(await dad.PostAsync(Events(familyId), Activity("Soccer Practice", kaiId)));
            await dad.PostAsync(Events(familyId), new { category = "Unavailable", startsAt = _monday.AddHours(8), endsAt = _monday.AddHours(9), notes = "Private" });
            var dadsProposal = await JsonAsync(await dad.PostAsync(Events(familyId), Joint("Recital", kaiId)));
            var momsProposal = await JsonAsync(await mom.PostAsync(Events(familyId), ParentingTime(momMembership, kaiId)));
            var reminders = $"/api/families/{familyId}/calendar/reminders";
            var spiritDay = (await JsonAsync(await dad.PostAsync(reminders, new { title = "Spirit Day", startsAt = _monday.AddHours(7) })))
                .GetProperty("id").GetGuid();
            await dad.PostAsync($"{reminders}/{spiritDay}/seen");
            await mom.PostAsync($"{reminders}/{spiritDay}/seen");

            var response = await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password });

            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await dad.GetAsync("/api/me")).StatusCode);

            // The family stays with Mom, now its only parent; Kai stays.
            var family = await JsonAsync(await mom.GetAsync($"/api/families/{familyId}"));
            Assert.Equal(["Mom"], family.GetProperty("members").EnumerateArray().Select(m => m.GetProperty("displayName").GetString()));
            Assert.Equal("Active", Assert.Single((await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/children"))).EnumerateArray())
                .GetProperty("status").GetString());

            // Shared history stays; Dad's private Unavailable time goes.
            var week = (await JsonAsync(await mom.GetAsync($"{Events(familyId)}?from={Q(_monday)}&to={Q(_monday.AddDays(7))}")))
                .EnumerateArray().ToList();
            Assert.Contains(week, e => e.GetProperty("id").GetGuid() == soccer.GetProperty("id").GetGuid());
            Assert.DoesNotContain(week, e => e.GetProperty("category").GetString() == "Unavailable");

            // Dad's shared reminder stays with the family; only his own Seen mark goes.
            var reminder = await JsonAsync(await mom.GetAsync($"{reminders}/{spiritDay}"));
            Assert.Equal("Spirit Day", reminder.GetProperty("title").GetString());
            Assert.Equal(momMembership, Assert.Single(reminder.GetProperty("seenBy").EnumerateArray()).GetProperty("membershipId").GetGuid());

            // Dad's pending proposal is withdrawn; Mom's no longer waits for anyone and is applied.
            var history = (await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/approvals?view=history"))).EnumerateArray().ToList();
            Assert.Equal("Withdrawn", history.Single(r => r.GetProperty("id").GetGuid() == dadsProposal.GetProperty("changeRequestId").GetGuid())
                .GetProperty("status").GetString());
            Assert.Equal("Approved", history.Single(r => r.GetProperty("id").GetGuid() == momsProposal.GetProperty("changeRequestId").GetGuid())
                .GetProperty("status").GetString());
            Assert.Empty((await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/approvals"))).EnumerateArray());

            Assert.Equal(0L, await CountAsync("identity.users", "display_name", "Dad"));

            // Mom gets a neutral notice that names nobody.
            var notice = mom.Emails.SentTo(momEmail)[^1];
            Assert.Equal("A parent has left your family on Parenthesis", notice.Subject);
            Assert.DoesNotContain("Dad", notice.TextBody, StringComparison.Ordinal);
            Assert.DoesNotContain("Dad", notice.HtmlBody, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task When_the_invited_parent_leaves_the_invitation_holding_their_email_goes_too()
    {
        var (dad, mom, momEmail, familyId, _) = await TwoParentFamilyAsync();
        using (dad)
        using (mom)
        {
            var response = await mom.PostAsync("/api/me/delete", new { password = ApiSession.Password });

            Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
            Assert.Equal(0L, await CountAsync("families.invitations", "normalized_email", momEmail.ToUpperInvariant()));
            Assert.Equal(["Dad"], (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"))).GetProperty("members")
                .EnumerateArray().Select(m => m.GetProperty("displayName").GetString()));
        }
    }

    [Fact]
    public async Task The_departed_parent_can_no_longer_reach_the_family()
    {
        var (dad, mom, _, familyId, _) = await TwoParentFamilyAsync();
        using (dad)
        using (mom)
        {
            await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password });

            Assert.Equal(HttpStatusCode.Unauthorized, (await dad.GetAsync($"/api/families/{familyId}")).StatusCode);
            Assert.Equal(1L, await api.QueryScalarAsync<long>(
                "select count(*) from families.memberships where family_id = @f and status = 'Left'", ("f", familyId)));
        }
    }

    [Fact]
    public async Task The_deletion_is_audited_without_personal_details()
    {
        using var dad = await ApiSession.SignedInAsync(api);
        await dad.CreateFamilyAsync();

        await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password });

        Assert.Equal(1L, await CountAsync("audit.audit_log", "action", "account.deleted"));
        Assert.Equal(1L, await CountAsync("audit.audit_log", "action", "family.deleted"));
    }

    private Task<long> CountAsync(string table, string column, object value) =>
        api.QueryScalarAsync<long>($"select count(*) from {table} where {column} = @v", ("v", value));

    private async Task<(ApiSession Dad, ApiSession Mom, string MomEmail, Guid FamilyId, Guid KaiId)> TwoParentFamilyAsync()
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync();
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        await mom.PostAsync($"/api/families/{familyId}/approvals/{kai.GetProperty("changeRequestId").GetGuid()}/approve");
        return (dad, mom, momEmail, familyId, kai.GetProperty("id").GetGuid());
    }

    private static string Events(Guid familyId) => $"/api/families/{familyId}/calendar/events";

    private static string Q(DateTimeOffset value) => Uri.EscapeDataString(value.ToString("O"));

    private static object Activity(string title, Guid child) =>
        new { category = "Activity", title, startsAt = _monday.AddHours(17), endsAt = _monday.AddHours(18), childIds = new[] { child } };

    private static object Joint(string title, Guid child) =>
        new { category = "Joint", title, startsAt = _monday.AddHours(18), endsAt = _monday.AddHours(20), childIds = new[] { child } };

    private static object ParentingTime(Guid caregiver, Guid child) => new
    {
        category = "ParentingTime",
        title = "Time with Mom",
        startsAt = _monday.AddDays(7),
        endsAt = _monday.AddDays(13),
        allDay = true,
        childIds = new[] { child },
        caregiverMembershipId = caregiver,
    };

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
