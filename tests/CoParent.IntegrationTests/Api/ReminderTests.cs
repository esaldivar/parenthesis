using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Shared reminders (#72, part 1: #170). Synthetic family only: Dad, Mom, Kai and Aurora.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ReminderTests(ApiFactory api) : IAsyncLifetime
{
    // Friday, October 16, 2026, in Chicago (CDT).
    private static readonly DateTimeOffset _friday = new(2026, 10, 16, 0, 0, 0, TimeSpan.FromHours(-5));

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Either_parent_creates_edits_and_deletes_at_once_and_history_says_who()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var created = await f.Dad.PostAsync(Reminders(f), new { title = "Spirit Day", startsAt = _friday, allDay = true, childId = f.KaiId, details = "Wear a blue shirt" });
        var id = (await JsonAsync(created)).GetProperty("id").GetGuid();
        var momSees = Assert.Single(await WeekAsync(f.Mom, f));
        var edited = await f.Mom.SendAsync(HttpMethod.Put, $"{Reminders(f)}/{id}",
            new { title = "Spirit Day: blue", startsAt = _friday, allDay = true, childId = f.KaiId, details = "Blue shirt and hat" });
        var dadView = await JsonAsync(await f.Dad.GetAsync($"{Reminders(f)}/{id}"));
        var momView = await JsonAsync(await f.Mom.GetAsync($"{Reminders(f)}/{id}"));
        var approvals = await JsonAsync(await f.Mom.GetAsync($"/api/families/{f.FamilyId}/approvals"));
        var deleted = await f.Mom.SendAsync(HttpMethod.Delete, $"{Reminders(f)}/{id}");

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal("Spirit Day", momSees.GetProperty("title").GetString());
        Assert.Equal(f.KaiId, momSees.GetProperty("childId").GetGuid());
        Assert.Equal(f.DadMembershipId, momSees.GetProperty("createdByMembershipId").GetGuid());
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        // The quiet "edited by" note is for the other parent only.
        Assert.Equal(f.MomMembershipId, dadView.GetProperty("editedBy").GetGuid());
        Assert.Equal(JsonValueKind.Null, momView.GetProperty("editedBy").ValueKind);
        Assert.Empty(approvals.EnumerateArray()); // No approval request, ever.
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Empty(await WeekAsync(f.Dad, f));
        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.GetAsync($"{Reminders(f)}/{id}")).StatusCode);
    }

    [Fact]
    public async Task History_records_the_actor_and_the_fields_that_changed()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Picture day");

        await f.Mom.SendAsync(HttpMethod.Put, $"{Reminders(f)}/{id}", new { title = "Picture day", startsAt = _friday.AddHours(8), allDay = false, details = "Comb hair" });
        var unchanged = await f.Dad.SendAsync(HttpMethod.Put, $"{Reminders(f)}/{id}", new { title = "Picture day", startsAt = _friday.AddHours(8), allDay = false, details = "Comb hair" });
        var history = (await JsonAsync(await f.Dad.GetAsync($"{Reminders(f)}/{id}/history"))).EnumerateArray().ToList();

        Assert.Equal(HttpStatusCode.OK, unchanged.StatusCode);
        Assert.Equal(2, history.Count); // Saving without changes adds nothing.
        Assert.Equal("Created", history[0].GetProperty("action").GetString());
        Assert.Equal(f.DadMembershipId, history[0].GetProperty("actorMembershipId").GetGuid());
        Assert.Equal("Edited", history[1].GetProperty("action").GetString());
        Assert.Equal(f.MomMembershipId, history[1].GetProperty("actorMembershipId").GetGuid());
        Assert.Equal("date, details", history[1].GetProperty("changes").GetString());
    }

    [Fact]
    public async Task Seen_is_set_only_by_opening_the_details_and_only_for_yourself()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Library books due");

        await WeekAsync(f.Mom, f);
        var afterLoading = await JsonAsync(await f.Mom.GetAsync($"{Reminders(f)}/{id}"));
        // Mom tries to mark it seen for Dad: the server only ever uses the signed-in parent.
        var seen = await f.Mom.PostAsync($"{Reminders(f)}/{id}/seen", new { membershipId = f.DadMembershipId });
        var afterOpening = (await JsonAsync(await f.Dad.GetAsync($"{Reminders(f)}/{id}"))).GetProperty("seenBy").EnumerateArray().ToList();

        Assert.Empty(afterLoading.GetProperty("seenBy").EnumerateArray());
        Assert.Equal(HttpStatusCode.NoContent, seen.StatusCode);
        Assert.Equal(f.MomMembershipId, Assert.Single(afterOpening).GetProperty("membershipId").GetGuid());
    }

    [Fact]
    public async Task A_real_edit_clears_the_other_parents_Seen_but_not_the_editors()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Book fair");
        await f.Dad.PostAsync($"{Reminders(f)}/{id}/seen");
        await f.Mom.PostAsync($"{Reminders(f)}/{id}/seen");

        // Saving without changes keeps both.
        await f.Mom.SendAsync(HttpMethod.Put, $"{Reminders(f)}/{id}", new { title = "Book fair", startsAt = _friday.AddHours(9) });
        var unchanged = (await JsonAsync(await f.Dad.GetAsync($"{Reminders(f)}/{id}"))).GetProperty("seenBy").GetArrayLength();
        await f.Mom.SendAsync(HttpMethod.Put, $"{Reminders(f)}/{id}", new { title = "Book fair: bring $10", startsAt = _friday.AddHours(9) });
        var afterEdit = (await JsonAsync(await f.Dad.GetAsync($"{Reminders(f)}/{id}"))).GetProperty("seenBy").EnumerateArray().ToList();

        Assert.Equal(2, unchanged);
        Assert.Equal(f.MomMembershipId, Assert.Single(afterEdit).GetProperty("membershipId").GetGuid());
    }

    [Theory]
    [InlineData("title")]
    [InlineData("long-title")]
    [InlineData("startsAt")]
    [InlineData("details")]
    [InlineData("childId")]
    public async Task Invalid_reminders_are_rejected(string problem)
    {
        var f = await FamilyAsync();
        using var _ = f;
        object body = problem switch
        {
            "title" => new { title = " ", startsAt = _friday },
            "long-title" => new { title = new string('x', 81), startsAt = _friday },
            "startsAt" => new { title = "No date" },
            "details" => new { title = "Long", startsAt = _friday, details = new string('x', 1001) },
            _ => new { title = "Someone else's child", startsAt = _friday, childId = Guid.CreateVersion7() },
        };

        var response = await f.Dad.PostAsync(Reminders(f), body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty(problem == "long-title" ? "title" : problem, out var field) && field.ValueKind == JsonValueKind.Array);
    }

    [Fact]
    public async Task Listing_returns_only_the_range_asked_for()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await CreateAsync(f.Dad, f, "This week");
        await f.Dad.PostAsync(Reminders(f), new { title = "Next month", startsAt = _friday.AddDays(30) });

        var tooWide = await f.Dad.GetAsync($"{Reminders(f)}?from={Q(_friday)}&to={Q(_friday.AddDays(90))}");

        Assert.Equal("This week", Assert.Single(await WeekAsync(f.Dad, f)).GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, tooWide.StatusCode);
    }

    [Fact]
    public async Task Other_households_cannot_reach_reminders()
    {
        // Child sessions are refused too: see ChildAccessTests (one child sign-in for the whole suite's rate limit).
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Field trip form");
        using var outsider = await ApiSession.SignedInAsync(api);

        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"{Reminders(f)}/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.SendAsync(HttpMethod.Delete, $"{Reminders(f)}/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PostAsync($"{Reminders(f)}/{id}/seen")).StatusCode);
        Assert.Single(await WeekAsync(f.Dad, f));
    }

    [Fact]
    public async Task Weekly_reminders_keep_their_local_time_across_daylight_saving()
    {
        var f = await FamilyAsync();
        using var _ = f;
        // Mondays at 8:00 AM in Chicago, three times. Daylight saving ends on Sunday, November 1, 2026.
        var monday = new DateTimeOffset(2026, 10, 26, 8, 0, 0, TimeSpan.FromHours(-5));
        await f.Dad.PostAsync(Reminders(f), new { title = "Library day", startsAt = monday, repeat = "Weekly", repeatCount = 3 });

        var all = await RangeAsync(f.Mom, f, monday.AddDays(-1), monday.AddDays(20));
        var middle = await RangeAsync(f.Mom, f, new(2026, 11, 1, 0, 0, 0, TimeSpan.FromHours(-5)), new(2026, 11, 8, 0, 0, 0, TimeSpan.FromHours(-6)));

        Assert.Equal(
            [Utc(2026, 10, 26, 13), Utc(2026, 11, 2, 14), Utc(2026, 11, 9, 14)],
            all.Select(r => r.GetProperty("startsAt").GetDateTimeOffset()));
        Assert.All(all, r => Assert.Equal(Utc(2026, 10, 26, 13), r.GetProperty("seriesStartsAt").GetDateTimeOffset()));
        Assert.Single(all.Select(r => r.GetProperty("id").GetGuid()).Distinct());
        Assert.Equal(Utc(2026, 11, 2, 14), Assert.Single(middle).GetProperty("startsAt").GetDateTimeOffset());
    }

    [Fact]
    public async Task Monthly_on_the_31st_falls_on_the_last_day_of_shorter_months()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var cst = TimeSpan.FromHours(-6);
        await f.Dad.PostAsync(Reminders(f), new { title = "Pay school lunch", startsAt = new DateTimeOffset(2027, 1, 31, 9, 0, 0, cst), repeat = "Monthly", repeatCount = 4 });

        var winter = await RangeAsync(f.Dad, f, new(2027, 1, 15, 0, 0, 0, cst), new(2027, 3, 15, 0, 0, 0, cst));
        var spring = await RangeAsync(f.Dad, f, new(2027, 3, 15, 0, 0, 0, cst), new(2027, 5, 10, 0, 0, 0, cst));

        Assert.Equal([Utc(2027, 1, 31, 15), Utc(2027, 2, 28, 15)], winter.Select(r => r.GetProperty("startsAt").GetDateTimeOffset()));
        // Daylight saving started March 14, 2027: still 9:00 AM in Chicago.
        Assert.Equal([Utc(2027, 3, 31, 14), Utc(2027, 4, 30, 14)], spring.Select(r => r.GetProperty("startsAt").GetDateTimeOffset()));
    }

    [Fact]
    public async Task Daily_until_a_date_includes_that_day_and_survives_a_reload()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var tuesday = new DateTimeOffset(2026, 10, 20, 0, 0, 0, TimeSpan.FromHours(-5));
        var id = (await JsonAsync(await f.Dad.PostAsync(Reminders(f),
            new { title = "Practice spelling", startsAt = tuesday, allDay = true, repeat = "Daily", repeatUntil = "2026-10-22" })))
            .GetProperty("id").GetGuid();

        var week = await RangeAsync(f.Dad, f, tuesday.AddDays(-1), tuesday.AddDays(6));
        var series = await JsonAsync(await f.Mom.GetAsync($"{Reminders(f)}/{id}"));

        Assert.Equal(3, week.Count);
        Assert.Equal("Daily", series.GetProperty("repeat").GetString());
        Assert.Equal("2026-10-22", series.GetProperty("repeatUntil").GetString());
        Assert.Equal(tuesday, series.GetProperty("startsAt").GetDateTimeOffset());
    }

    [Theory]
    [InlineData("no-end")]
    [InlineData("both-ends")]
    [InlineData("count")]
    [InlineData("until-before")]
    [InlineData("until-far")]
    [InlineData("frequency")]
    public async Task Invalid_repeats_are_rejected(string problem)
    {
        var f = await FamilyAsync();
        using var _ = f;
        object body = problem switch
        {
            "no-end" => new { title = "R", startsAt = _friday, repeat = "Daily" },
            "both-ends" => new { title = "R", startsAt = _friday, repeat = "Daily", repeatCount = 3, repeatUntil = "2026-10-30" },
            "count" => new { title = "R", startsAt = _friday, repeat = "Weekly", repeatCount = 1 },
            "until-before" => new { title = "R", startsAt = _friday, repeat = "Weekly", repeatUntil = "2026-10-15" },
            "until-far" => new { title = "R", startsAt = _friday, repeat = "Monthly", repeatUntil = "2029-01-01" },
            _ => (object)new { title = "R", startsAt = _friday, repeat = "Yearly", repeatCount = 3 },
        };

        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.PostAsync(Reminders(f), body)).StatusCode);
        Assert.Empty(await WeekAsync(f.Dad, f));
    }

    [Fact]
    public async Task Changing_the_repeat_applies_to_the_whole_series_and_is_in_history()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = (await JsonAsync(await f.Dad.PostAsync(Reminders(f),
            new { title = "Feed the fish", startsAt = _friday.AddHours(7), repeat = "Weekly", repeatCount = 3 }))).GetProperty("id").GetGuid();

        var edited = await f.Mom.SendAsync(HttpMethod.Put, $"{Reminders(f)}/{id}",
            new { title = "Feed the fish", startsAt = _friday.AddHours(7), repeat = "Daily", repeatCount = 2 });
        var occurrences = await RangeAsync(f.Dad, f, _friday, _friday.AddDays(21));
        var history = (await JsonAsync(await f.Dad.GetAsync($"{Reminders(f)}/{id}/history"))).EnumerateArray().ToList();

        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.Equal([_friday.AddHours(7), _friday.AddHours(7).AddDays(1)], occurrences.Select(r => r.GetProperty("startsAt").GetDateTimeOffset()));
        Assert.Equal("repeat", history[^1].GetProperty("changes").GetString());
    }

    private static DateTimeOffset Utc(int year, int month, int day, int hour) => new(year, month, day, hour, 0, 0, TimeSpan.Zero);

    private static async Task<List<JsonElement>> RangeAsync(ApiSession session, Family f, DateTimeOffset from, DateTimeOffset to) =>
        (await JsonAsync(await session.GetAsync($"{Reminders(f)}?from={Q(from)}&to={Q(to)}"))).EnumerateArray().ToList();

    private static async Task<Guid> CreateAsync(ApiSession parent, Family f, string title) =>
        (await JsonAsync(await parent.PostAsync(Reminders(f), new { title, startsAt = _friday.AddHours(9) }))).GetProperty("id").GetGuid();

    private static string Reminders(Family f) => $"/api/families/{f.FamilyId}/calendar/reminders";

    private static string Q(DateTimeOffset value) => Uri.EscapeDataString(value.ToString("O"));

    private static async Task<List<JsonElement>> WeekAsync(ApiSession session, Family f) =>
        (await JsonAsync(await session.GetAsync($"{Reminders(f)}?from={Q(_friday.AddDays(-4))}&to={Q(_friday.AddDays(3))}"))).EnumerateArray().ToList();

    /// <summary>Dad and Mom; Kai and Aurora approved by both.</summary>
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
        Guid Membership(string name) => members.Single(m => m.GetProperty("displayName").GetString() == name).GetProperty("membershipId").GetGuid();
        return new Family(dad, mom, familyId, kai.GetProperty("id").GetGuid(), Membership("Dad"), Membership("Mom"));
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
