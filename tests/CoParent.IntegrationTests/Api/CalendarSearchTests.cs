using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Searching the calendar by title, event type or date (#253).</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class CalendarSearchTests(ApiFactory api) : IAsyncLifetime
{
    /// <summary>Early October 2026: on or after the fixed "today" for new dates, and already past by the real clock.</summary>
    private static readonly DateTimeOffset _past = new(2026, 10, 5, 0, 0, 0, TimeSpan.FromHours(-5));

    /// <summary>Well after the real clock, so these events stay upcoming whenever the tests run.</summary>
    private static readonly DateTimeOffset _future = new DateTimeOffset(DateTimeOffset.UtcNow.Date, TimeSpan.Zero).AddDays(90);

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Titles_match_in_part_and_any_case_across_history_upcoming_soonest_and_past_most_recent_first()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await ActivityAsync(f, "Soccer Practice", _future.AddDays(10));
        await ActivityAsync(f, "Soccer Final", _future);
        await ActivityAsync(f, "Soccer Tryouts", _past);
        await ActivityAsync(f, "Soccer Camp", _past.AddDays(2));
        await ActivityAsync(f, "Piano", _future);

        var upcoming = await SearchAsync(f.Mom, f, "q=sOCCer");
        var past = await SearchAsync(f.Mom, f, "q=occer&past=true");

        Assert.Equal(["Soccer Final", "Soccer Practice"], Titles(upcoming));
        Assert.Equal(["Soccer Camp", "Soccer Tryouts"], Titles(past));
        Assert.False(upcoming.GetProperty("hasMore").GetBoolean());
    }

    [Fact]
    public async Task Event_types_match_and_parenting_time_can_be_narrowed_to_one_parent()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await ConfirmedParentingTimeAsync(f.Dad, f.Mom, f, f.DadMembershipId, _future);
        await ConfirmedParentingTimeAsync(f.Mom, f.Dad, f, f.MomMembershipId, _future.AddDays(10));
        await ActivityAsync(f, "Dentist", _future, "Dental");

        var all = await SearchAsync(f.Mom, f, "category=ParentingTime");
        var dads = await SearchAsync(f.Mom, f, $"category=ParentingTime&caregiver={f.DadMembershipId}");
        var dental = await SearchAsync(f.Mom, f, "category=Dental&category=Medical");

        Assert.Equal(2, Titles(all).Count);
        var only = Assert.Single(dads.GetProperty("events").EnumerateArray());
        Assert.Equal(f.DadMembershipId, only.GetProperty("caregiverMembershipId").GetGuid());
        Assert.Equal(["Dentist"], Titles(dental));
    }

    [Fact]
    public async Task A_date_finds_events_on_that_family_local_day_including_ones_spanning_it()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await ActivityAsync(f, "Field trip", _past.AddHours(9));
        await f.Dad.PostAsync(Events(f), new
        {
            category = "Holiday",
            title = "Fall break",
            startsAt = _past.AddDays(-3),
            endsAt = _past.AddDays(2),
            allDay = true,
        });
        await ActivityAsync(f, "Next day", _past.AddDays(1).AddHours(9));

        var found = await SearchAsync(f.Mom, f, "on=2026-10-05&past=true");

        Assert.Equal(["Fall break", "Field trip"], Titles(found).Order().ToList());
    }

    [Fact]
    public async Task Search_never_shows_another_familys_events_or_matches_the_other_parents_unavailable_time_by_title()
    {
        var f = await FamilyAsync();
        using var _ = f;
        using var stranger = await ApiSession.SignedInAsync(api, displayName: "Stranger");
        var otherFamily = await stranger.CreateFamilyAsync("Other Family");
        await stranger.PostAsync($"/api/families/{otherFamily}/calendar/events", new
        {
            category = "Activity",
            title = "Secret soccer",
            startsAt = _future,
            endsAt = _future.AddHours(1),
        });
        await ActivityAsync(f, "Soccer", _future);
        await f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = _future, endsAt = _future.AddHours(2), notes = "Soccer coaching course" });

        var moms = await SearchAsync(f.Mom, f, "q=soccer");
        var unavailableForMom = await SearchAsync(f.Mom, f, "category=Unavailable");
        var crossFamily = await f.Mom.GetAsync($"/api/families/{otherFamily}/calendar/events/search?q=soccer");

        Assert.Equal(["Soccer"], Titles(moms));
        var unavailable = Assert.Single(unavailableForMom.GetProperty("events").EnumerateArray());
        Assert.Equal("Unavailable", unavailable.GetProperty("title").GetString());
        Assert.Equal(JsonValueKind.Null, unavailable.GetProperty("notes").ValueKind);
        Assert.DoesNotContain("coaching", unavailableForMom.GetRawText(), StringComparison.Ordinal);
        Assert.NotEqual(HttpStatusCode.OK, crossFamily.StatusCode);
    }

    [Fact]
    public async Task Results_page_with_a_limit_and_wildcards_match_literally()
    {
        var f = await FamilyAsync();
        using var _ = f;
        for (var i = 0; i < 3; i++)
        {
            await ActivityAsync(f, $"Swim {i}", _future.AddDays(i));
        }

        await ActivityAsync(f, "100% fun", _future);

        var first = await SearchAsync(f.Mom, f, "q=swim&limit=2");
        var second = await SearchAsync(f.Mom, f, "q=swim&limit=2&offset=2");
        var percent = await SearchAsync(f.Mom, f, "q=%25");
        var underscore = await SearchAsync(f.Mom, f, "q=_");

        Assert.Equal(["Swim 0", "Swim 1"], Titles(first));
        Assert.True(first.GetProperty("hasMore").GetBoolean());
        Assert.Equal(["Swim 2"], Titles(second));
        Assert.False(second.GetProperty("hasMore").GetBoolean());
        Assert.Equal(["100% fun"], Titles(percent));
        Assert.Empty(Titles(underscore));
    }

    [Theory]
    [InlineData("")]
    [InlineData("q=%20%20")]
    [InlineData("q=soccer&limit=0")]
    [InlineData("q=soccer&limit=51")]
    [InlineData("q=soccer&offset=-1")]
    public async Task An_empty_or_out_of_range_search_is_refused(string query)
    {
        var f = await FamilyAsync();
        using var _ = f;

        var response = await f.Mom.GetAsync($"{Events(f)}/search?{query}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task A_child_session_cannot_search()
    {
        var f = await FamilyAsync();
        using var _ = f;
        using var kai = await KaiSignedInAsync(f);

        var response = await kai.GetAsync($"{Events(f)}/search?q=soccer");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static async Task ActivityAsync(Family f, string title, DateTimeOffset startsAt, string category = "Activity")
    {
        var response = await f.Dad.PostAsync(Events(f), new { category, title, startsAt, endsAt = startsAt.AddHours(1) });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    private static async Task ConfirmedParentingTimeAsync(ApiSession owner, ApiSession other, Family f, Guid caregiver, DateTimeOffset startsAt)
    {
        var created = await JsonAsync(await owner.PostAsync(Events(f), new
        {
            category = "ParentingTime",
            title = "Parenting time",
            startsAt,
            endsAt = startsAt.AddDays(3),
            allDay = false,
            childIds = new[] { f.KaiId },
            caregiverMembershipId = caregiver,
        }));
        await other.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve");
    }

    private static async Task<JsonElement> SearchAsync(ApiSession session, Family f, string query)
    {
        var response = await session.GetAsync($"{Events(f)}/search?{query}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await JsonAsync(response);
    }

    private static List<string?> Titles(JsonElement page) =>
        page.GetProperty("events").EnumerateArray().Select(e => e.GetProperty("title").GetString()).ToList();

    private static string Events(Family f) => $"/api/families/{f.FamilyId}/calendar/events";

    /// <summary>Dad and Mom, with Kai approved by both.</summary>
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

    private async Task<ApiSession> KaiSignedInAsync(Family f)
    {
        await f.Dad.SendAsync(HttpMethod.Put, $"/api/families/{f.FamilyId}/children/{f.KaiId}/pin", new { pin = "2580" });
        var code = (await JsonAsync(await f.Dad.PostAsync($"/api/families/{f.FamilyId}/children/{f.KaiId}/pairing-code")))
            .GetProperty("code").GetString();
        var tablet = await ApiSession.StartAsync(api);
        await tablet.PostAsync("/api/device/pair", new { code, deviceName = "Kai's tablet" });
        await tablet.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await tablet.PostAsync("/api/device/child-session", new { childId = f.KaiId, pin = "2580" })).StatusCode);
        await tablet.RefreshAntiforgeryAsync();
        return tablet;
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
