using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Declined requests on the calendar (#199). Owner decisions, October 22, 2026: a declined new event shows to both
/// parents as declined until its dates pass or each parent removes it from their own calendar; withdrawn and expired
/// requests just go. Children never see it (checked with a child's view in CalendarTests).
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class DeclinedRequestTests(ApiFactory api) : IAsyncLifetime
{
    // Always ahead of the real clock: declined requests show only until their dates pass.
    private static readonly DateTimeOffset _start = new(DateTime.UtcNow.Date.AddDays(14), TimeSpan.Zero);

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task A_declined_event_shows_to_both_parents_until_each_removes_it_from_their_own_calendar()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime(f, _start)));
        await Decide(f.Mom, f, created, "reject");

        var dads = Assert.Single(await RangeAsync(f.Dad, f));
        var moms = Assert.Single(await RangeAsync(f.Mom, f));
        Assert.Equal("Rejected", dads.GetProperty("status").GetString());
        Assert.Equal("Rejected", moms.GetProperty("status").GetString());

        var id = created.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await f.Dad.GetAsync($"{Events(f)}/{id}")).StatusCode);
        var dismissed = await f.Dad.PostAsync($"{Events(f)}/{id}/dismiss");
        var again = await f.Dad.PostAsync($"{Events(f)}/{id}/dismiss");

        Assert.Equal(HttpStatusCode.NoContent, dismissed.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, again.StatusCode);
        Assert.Empty(await RangeAsync(f.Dad, f));
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync($"{Events(f)}/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await f.Mom.GetAsync($"{Events(f)}/{id}")).StatusCode);
        // Only Dad's calendar changed.
        Assert.Equal("Rejected", Assert.Single(await RangeAsync(f.Mom, f)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Withdrawn_requests_and_declined_changes_dont_show_as_declined_events()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var withdrawn = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime(f, _start)));
        await Decide(f.Dad, f, withdrawn, "withdraw");

        var confirmed = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime(f, _start.AddDays(7))));
        await Decide(f.Mom, f, confirmed, "approve");
        var swap = await JsonAsync(await f.Dad.SendAsync(
            HttpMethod.Patch, $"{Events(f)}/{confirmed.GetProperty("id").GetGuid()}", new { startsAt = _start.AddDays(8) }));
        await Decide(f.Mom, f, swap, "reject");

        var week = await RangeAsync(f.Mom, f);
        var only = Assert.Single(week);
        Assert.Equal("Confirmed", only.GetProperty("status").GetString());
        Assert.Equal("None", only.GetProperty("pendingChange").GetString());
        // There's nothing declined to remove.
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.PostAsync($"{Events(f)}/{withdrawn.GetProperty("id").GetGuid()}/dismiss")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.PostAsync($"{Events(f)}/{confirmed.GetProperty("id").GetGuid()}/dismiss")).StatusCode);
    }

    [Fact]
    public async Task A_declined_event_never_counts_as_a_conflict()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var declined = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime(f, _start)));
        await Decide(f.Mom, f, declined, "reject");

        var overlapping = await JsonAsync(await f.Mom.PostAsync(Events(f), ParentingTime(f, _start, f.MomMembershipId)));

        Assert.Empty(overlapping.GetProperty("warnings").EnumerateArray());
    }

    [Fact]
    public async Task Another_familys_parent_cant_see_or_remove_a_declined_event()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var declined = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime(f, _start)));
        await Decide(f.Mom, f, declined, "reject");

        using var stranger = await ApiSession.SignedInAsync(api, displayName: "Stranger");
        var theirFamily = await stranger.CreateFamilyAsync("Other Family");
        var viaOwnFamily = await stranger.PostAsync(
            $"/api/families/{theirFamily}/calendar/events/{declined.GetProperty("id").GetGuid()}/dismiss");
        var viaTheirs = await stranger.PostAsync($"{Events(f)}/{declined.GetProperty("id").GetGuid()}/dismiss");

        Assert.Equal(HttpStatusCode.NotFound, viaOwnFamily.StatusCode);
        Assert.NotEqual(HttpStatusCode.NoContent, viaTheirs.StatusCode);
        Assert.Equal("Rejected", Assert.Single(await RangeAsync(f.Dad, f)).GetProperty("status").GetString());
    }

    private static async Task Decide(ApiSession session, Family f, JsonElement created, string action)
    {
        var response = await session.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/{action}");
        Assert.True(response.IsSuccessStatusCode, $"{action}: {response.StatusCode}");
    }

    private static object ParentingTime(Family f, DateTimeOffset start, Guid? caregiver = null) => new
    {
        category = "ParentingTime",
        title = "Time with Dad",
        startsAt = start,
        endsAt = start.AddDays(2),
        allDay = true,
        childIds = new[] { f.KaiId },
        caregiverMembershipId = caregiver ?? f.DadMembershipId,
    };

    private static string Events(Family f) => $"/api/families/{f.FamilyId}/calendar/events";

    private static string Q(DateTimeOffset value) => Uri.EscapeDataString(value.ToString("O"));

    private static async Task<List<JsonElement>> RangeAsync(ApiSession session, Family f) =>
        (await JsonAsync(await session.GetAsync($"{Events(f)}?from={Q(_start.AddDays(-1))}&to={Q(_start.AddDays(14))}")))
            .EnumerateArray().ToList();

    /// <summary>Dad and Mom; Kai approved by both.</summary>
    private async Task<Family> FamilyAsync()
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        await mom.PostAsync("/api/invitations/accept", new { token });
        await mom.PostAsync($"/api/families/{familyId}/approvals/{kai.GetProperty("changeRequestId").GetGuid()}/approve");

        var members = (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"))).GetProperty("members").EnumerateArray().ToList();
        var dadMembership = members.Single(m => m.GetProperty("displayName").GetString() == "Dad").GetProperty("membershipId").GetGuid();
        var momMembership = members.Single(m => m.GetProperty("displayName").GetString() == "Mom").GetProperty("membershipId").GetGuid();
        return new Family(dad, mom, familyId, kai.GetProperty("id").GetGuid(), dadMembership, momMembership);
    }

    private sealed record Family(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId, Guid DadMembershipId, Guid MomMembershipId)
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
