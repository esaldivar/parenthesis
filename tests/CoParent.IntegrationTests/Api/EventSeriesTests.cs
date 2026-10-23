using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Repeating unavailable time and activities (#193, C-05). Synthetic family only: Dad, Mom and Kai.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class EventSeriesTests(ApiFactory api) : IAsyncLifetime
{
    // Wednesday, October 28, 2026, 9:00 AM in Chicago (CDT). Daylight saving ends Sunday, November 1.
    private static readonly DateTimeOffset _wednesday = new(2026, 10, 28, 9, 0, 0, TimeSpan.FromHours(-5));

    private static readonly string[] _wednesdays = ["Wednesday"];
    private static readonly string[] _wednesdayAndFriday = ["Wednesday", "Friday"];

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Unavailable_time_repeats_on_chosen_days_at_the_same_local_time_and_stays_private()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var created = await f.Dad.PostAsync(Events(f), new
        {
            category = "Unavailable",
            startsAt = _wednesday,
            endsAt = _wednesday.AddHours(3),
            notes = "Physical therapy",
            repeat = new { days = _wednesdayAndFriday, until = "2026-11-13" },
        });
        var first = await JsonAsync(created);
        var dadSees = await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(20));
        var momSees = await RangeAsync(f.Mom, f, _wednesday.AddDays(-1), _wednesday.AddDays(20));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(["Wednesday", "Friday"], first.GetProperty("repeat").GetProperty("days").EnumerateArray().Select(d => d.GetString()));
        Assert.Equal("2026-11-13", first.GetProperty("repeat").GetProperty("until").GetString());
        // Oct 28 and 30 at 9:00 AM CDT (14:00 UTC); from Nov 4, 9:00 AM CST (15:00 UTC).
        Assert.Equal(
            [Utc(10, 28, 14), Utc(10, 30, 14), Utc(11, 4, 15), Utc(11, 6, 15), Utc(11, 11, 15), Utc(11, 13, 15)],
            dadSees.Select(e => e.GetProperty("startsAt").GetDateTimeOffset()));
        Assert.All(dadSees, e => Assert.Equal(first.GetProperty("seriesId").GetGuid(), e.GetProperty("seriesId").GetGuid()));
        Assert.All(dadSees, e => Assert.Equal("Physical therapy", e.GetProperty("notes").GetString()));
        // Mom sees each date as Unavailable, never the note.
        Assert.Equal(6, momSees.Count);
        Assert.All(momSees, e => Assert.Equal(JsonValueKind.Null, e.GetProperty("notes").ValueKind));
    }

    [Fact]
    public async Task An_activity_repeats_a_number_of_times_with_its_children()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var created = await f.Mom.PostAsync(Events(f), new
        {
            category = "Activity",
            title = "Swim lessons",
            startsAt = _wednesday.AddHours(8),
            endsAt = _wednesday.AddHours(9),
            childIds = new[] { f.KaiId },
            repeat = new { days = _wednesdays, count = 3 },
        });
        var dates = await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(3, dates.Count);
        Assert.All(dates, e => Assert.Equal(f.KaiId, Assert.Single(e.GetProperty("childIds").EnumerateArray()).GetGuid()));
        Assert.All(dates, e => Assert.Equal("Confirmed", e.GetProperty("status").GetString()));
        Assert.Empty((await JsonAsync(await f.Dad.GetAsync($"/api/families/{f.FamilyId}/approvals"))).EnumerateArray());
    }

    [Fact]
    public async Task It_repeats_every_few_days_weeks_or_months_and_says_how()
    {
        var f = await FamilyAsync();
        using var _ = f;

        // Every 2 days, 4 times: across the end of daylight saving on November 1, still at 9:00 AM.
        var everyOtherDay = await JsonAsync(await f.Dad.PostAsync(Events(f), Unavailable(new { frequency = "Daily", interval = 2, count = 4 })));
        // Every 2 weeks on Wednesday and Friday, 4 times.
        var fortnightly = await JsonAsync(await f.Mom.PostAsync(Events(f), new
        {
            category = "Activity",
            title = "Swim lessons",
            startsAt = _wednesday.AddHours(8),
            endsAt = _wednesday.AddHours(9),
            repeat = new { frequency = "Weekly", interval = 2, days = _wednesdayAndFriday, count = 4 },
        }));
        // Monthly on the 31st from Saturday, October 31: months without a 31st are skipped.
        var halloween = _wednesday.AddDays(3).AddHours(9);
        var monthly = await JsonAsync(await f.Mom.PostAsync(Events(f), new
        {
            category = "Activity",
            title = "Library day",
            startsAt = halloween,
            endsAt = halloween.AddHours(1),
            repeat = new { frequency = "Monthly", interval = 1, until = "2027-03-31" },
        }));

        Assert.Equal("Daily", everyOtherDay.GetProperty("repeat").GetProperty("frequency").GetString());
        Assert.Equal(2, everyOtherDay.GetProperty("repeat").GetProperty("interval").GetInt32());
        Assert.Empty(everyOtherDay.GetProperty("repeat").GetProperty("days").EnumerateArray());
        Assert.Equal([Utc(10, 28, 14), Utc(10, 30, 14), Utc(11, 1, 15), Utc(11, 3, 15)], await SeriesStartsAsync(f, everyOtherDay));
        Assert.Equal(2, fortnightly.GetProperty("repeat").GetProperty("interval").GetInt32());
        Assert.Equal([Utc(10, 28, 22), Utc(10, 30, 22), Utc(11, 11, 23), Utc(11, 13, 23)], await SeriesStartsAsync(f, fortnightly));
        Assert.Equal("Monthly", monthly.GetProperty("repeat").GetProperty("frequency").GetString());
        // 6:00 PM on Oct 31, Dec 31, Jan 31 and Mar 31 (CDT, CST, CST, CDT).
        Assert.Equal(
            [Utc(10, 31, 23), new DateTimeOffset(2027, 1, 1, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2027, 2, 1, 0, 0, 0, TimeSpan.Zero), new DateTimeOffset(2027, 3, 31, 23, 0, 0, TimeSpan.Zero)],
            await SeriesStartsAsync(f, monthly));
    }

    [Theory]
    [InlineData("every-27-weeks")]
    [InlineData("every-13-months")]
    [InlineData("every-0-days")]
    [InlineData("runs-into-the-next")]
    [InlineData("family-event")]
    [InlineData("no-days")]
    [InlineData("both-ends")]
    [InlineData("no-end")]
    [InlineData("count-one")]
    [InlineData("until-before")]
    [InlineData("until-past-a-year")]
    [InlineData("count-past-a-year")]
    public async Task Invalid_repeats_are_rejected_and_nothing_is_added(string problem)
    {
        var f = await FamilyAsync();
        using var _ = f;
        var weekly = _wednesdays;
        object body = problem switch
        {
            "every-27-weeks" => Unavailable(new { frequency = "Weekly", interval = 27, days = weekly, count = 2 }),
            "every-13-months" => Unavailable(new { frequency = "Monthly", interval = 13, count = 2 }),
            "every-0-days" => Unavailable(new { frequency = "Daily", interval = 0, count = 2 }),
            "runs-into-the-next" => new
            {
                category = "Unavailable",
                startsAt = _wednesday,
                endsAt = _wednesday.AddDays(2),
                repeat = new { frequency = "Daily", interval = 1, count = 3 },
            },
            "family-event" => new { category = "Joint", title = "Dinner", startsAt = _wednesday, endsAt = _wednesday.AddHours(2), repeat = new { days = weekly, count = 4 } },
            "no-days" => Unavailable(new { days = Array.Empty<string>(), count = 4 }),
            "both-ends" => Unavailable(new { days = weekly, count = 4, until = "2026-12-01" }),
            "no-end" => Unavailable(new { days = weekly }),
            "count-one" => Unavailable(new { days = weekly, count = 1 }),
            "until-before" => Unavailable(new { days = weekly, until = "2026-10-27" }),
            "until-past-a-year" => Unavailable(new { days = weekly, until = "2027-10-29" }),
            _ => Unavailable(new { days = weekly, count = 60 }),
        };

        var response = await f.Dad.PostAsync(Events(f), body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(50)));
    }

    [Fact]
    public async Task This_event_this_and_following_and_all_events_change_the_right_dates()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var ids = await SwimSeriesAsync(f);

        // Following, from the second date: new title and 4:00–5:30 PM, each on its own day.
        var following = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{ids[1]}?scope=following", new
        {
            title = "Swim team",
            startsAt = new DateTimeOffset(2026, 11, 4, 16, 0, 0, TimeSpan.FromHours(-6)),
            endsAt = new DateTimeOffset(2026, 11, 4, 17, 30, 0, TimeSpan.FromHours(-6)),
        });
        // All: a new place for every date (Mom can change shared activities too).
        var all = await f.Mom.SendAsync(HttpMethod.Patch, $"{Events(f)}/{ids[0]}?scope=all", new { location = "North Pool" });
        // This one only: the third date gets a note.
        var one = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{ids[2]}", new { notes = "Bring goggles" });
        var dates = await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30));

        Assert.Equal(HttpStatusCode.OK, following.StatusCode);
        Assert.Equal(HttpStatusCode.OK, all.StatusCode);
        Assert.Equal(HttpStatusCode.OK, one.StatusCode);
        Assert.Equal(["Swim lessons", "Swim team", "Swim team", "Swim team"], dates.Select(e => e.GetProperty("title").GetString()));
        // 5:00 PM CDT on Oct 28; 4:00 PM CST (22:00 UTC) from Nov 4, across the daylight-saving change.
        Assert.Equal([Utc(10, 28, 22), Utc(11, 4, 22), Utc(11, 11, 22), Utc(11, 18, 22)], dates.Select(e => e.GetProperty("startsAt").GetDateTimeOffset()));
        Assert.Equal(Utc(11, 18, 23).AddMinutes(30), dates[3].GetProperty("endsAt").GetDateTimeOffset());
        Assert.All(dates, e => Assert.Equal("North Pool", e.GetProperty("location").GetString()));
        Assert.Equal([null, null, "Bring goggles", null], dates.Select(e => e.GetProperty("notes").GetString()));
    }

    [Fact]
    public async Task A_change_to_several_dates_cant_move_them_to_other_days()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var ids = await SwimSeriesAsync(f);

        var moved = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{ids[1]}?scope=all", new
        {
            startsAt = _wednesday.AddDays(8).AddHours(8),
            endsAt = _wednesday.AddDays(8).AddHours(9),
        });
        var badScope = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{ids[1]}?scope=everything", new { title = "Swim" });

        Assert.Equal(HttpStatusCode.BadRequest, moved.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, badScope.StatusCode);
        Assert.All(await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30)),
            e => Assert.Equal(DayOfWeek.Wednesday, e.GetProperty("startsAt").GetDateTimeOffset().ToOffset(TimeSpan.FromHours(-6)).DayOfWeek));
    }

    [Fact]
    public async Task Cancelling_this_and_following_keeps_earlier_dates_and_all_events_removes_the_rest()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var ids = await SwimSeriesAsync(f);

        var following = await f.Mom.SendAsync(HttpMethod.Delete, $"{Events(f)}/{ids[2]}?scope=following");
        var afterFollowing = await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30));
        var all = await f.Dad.SendAsync(HttpMethod.Delete, $"{Events(f)}/{ids[0]}?scope=all");
        var afterAll = await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30));

        Assert.Equal(HttpStatusCode.NoContent, following.StatusCode);
        Assert.Equal([ids[0], ids[1]], afterFollowing.Select(e => e.GetProperty("id").GetGuid()));
        Assert.Equal(HttpStatusCode.NoContent, all.StatusCode);
        Assert.Empty(afterAll);
    }

    [Fact]
    public async Task Only_the_owner_changes_repeating_unavailable_time_and_other_households_get_404()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), Unavailable(new { days = _wednesdays, count = 3 })));
        var id = created.GetProperty("id").GetGuid();
        using var outsider = await ApiSession.SignedInAsync(api);

        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}?scope=all", new { notes = "Mine" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}?scope=all")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}?scope=all")).StatusCode);
        Assert.Equal(3, (await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30))).Count);
    }

    [Fact]
    public async Task Repeating_unavailable_time_over_your_own_parenting_time_is_refused_without_adding_any_date()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await DadsParentingTimeOnNovember4Async(f);

        var dads = await f.Dad.PostAsync(Events(f), Unavailable(new { days = _wednesdays, count = 3 }));
        var moms = await JsonAsync(await f.Mom.PostAsync(Events(f), Unavailable(new { days = _wednesdays, count = 3 })));

        // A parent can't have the children and be unavailable at once (#210); no date of the series is added.
        Assert.Equal(HttpStatusCode.BadRequest, dads.StatusCode);
        Assert.True((await JsonAsync(dads)).GetProperty("errors").TryGetProperty("overlapsYourParentingTime", out var _));
        Assert.DoesNotContain(
            await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30)),
            e => e.GetProperty("category").GetString() == "Unavailable" && e.GetProperty("ownerMembershipId").GetGuid() == f.DadMembershipId);
        // Mom's dates are her own business: nothing to warn about.
        Assert.Empty(moms.GetProperty("warnings").EnumerateArray());
    }

    [Fact]
    public async Task Moving_every_date_of_a_series_into_your_own_parenting_time_changes_none_of_them()
    {
        var f = await FamilyAsync();
        using var _ = f;
        // Dad's unavailable time, Wednesdays 9:00 to noon, three times; his parenting time on November 4 starts at 1:00 PM.
        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), Unavailable(new { days = _wednesdays, count = 3 })));
        await DadsParentingTimeOnNovember4Async(f, afternoonOnly: true);

        var before = await UnavailableStartsAsync(f);

        var moved = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{created.GetProperty("id").GetGuid()}?scope=all", new
        {
            startsAt = _wednesday.AddHours(5),
            endsAt = _wednesday.AddHours(7),
        });
        var renamed = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{created.GetProperty("id").GetGuid()}?scope=all", new { notes = "Physio" });

        Assert.Equal(HttpStatusCode.BadRequest, moved.StatusCode);
        Assert.True((await JsonAsync(moved)).GetProperty("errors").TryGetProperty("overlapsYourParentingTime", out var _));
        // A notes-only change still works.
        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        Assert.Equal(3, before.Count);
        Assert.Equal(before, await UnavailableStartsAsync(f));
    }

    private static async Task<List<DateTimeOffset>> UnavailableStartsAsync(Family f) =>
        (await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30)))
            .Where(e => e.GetProperty("category").GetString() == "Unavailable")
            .Select(e => e.GetProperty("startsAt").GetDateTimeOffset())
            .ToList();

    /// <summary>Dad's parenting time on Wednesday, November 4 (all day, or 1:00 to 6:00 PM), confirmed by Mom.</summary>
    private static async Task DadsParentingTimeOnNovember4Async(Family f, bool afternoonOnly = false)
    {
        var day = new DateTimeOffset(2026, 11, 4, 0, 0, 0, TimeSpan.FromHours(-6));
        var proposed = await JsonAsync(await f.Dad.PostAsync(Events(f), new
        {
            category = "ParentingTime",
            title = "Time with Dad",
            startsAt = afternoonOnly ? day.AddHours(13) : day,
            endsAt = afternoonOnly ? day.AddHours(18) : day.AddDays(1),
            allDay = !afternoonOnly,
            childIds = new[] { f.KaiId },
            caregiverMembershipId = f.DadMembershipId,
        }));
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{proposed.GetProperty("changeRequestId").GetGuid()}/approve");
    }

    [Fact]
    public async Task Repeating_parenting_time_waits_for_one_approval_of_every_date_then_confirms_them_all()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var created = await f.Dad.PostAsync(Events(f), DadsWednesdays(f, count: 3));
        var first = await JsonAsync(created);
        var requests = (await JsonAsync(await f.Mom.GetAsync($"/api/families/{f.FamilyId}/approvals"))).EnumerateArray().ToList();
        var pending = await SeriesEventsAsync(f, first);

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(3, pending.Count);
        Assert.All(pending, e => Assert.Equal("PendingApproval", e.GetProperty("status").GetString()));
        Assert.All(pending, e => Assert.Equal(f.DadMembershipId, e.GetProperty("caregiverMembershipId").GetGuid()));
        // One request for the series, never one per date.
        var request = Assert.Single(requests);
        Assert.Equal("CalendarCreate", request.GetProperty("type").GetString());
        Assert.Equal("calendar_series", request.GetProperty("targetType").GetString());
        Assert.Equal(first.GetProperty("seriesId").GetGuid(), request.GetProperty("targetId").GetGuid());
        Assert.Equal(first.GetProperty("changeRequestId").GetGuid(), request.GetProperty("id").GetGuid());
        Assert.Equal("Add: Time with Dad, every week on Wed, 3 dates: Oct 28, Nov 4, Nov 11", request.GetProperty("summary").GetString());

        var approved = await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{request.GetProperty("id").GetGuid()}/approve");

        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.All(await SeriesEventsAsync(f, first), e => Assert.Equal("Confirmed", e.GetProperty("status").GetString()));
    }

    [Fact]
    public async Task Approval_is_refused_and_nothing_confirmed_when_the_caregiver_became_unavailable_meanwhile()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var first = await JsonAsync(await f.Dad.PostAsync(Events(f), DadsWednesdays(f, count: 5)));
        // Dad's unavailable time on a Tuesday, moved straight in the database onto Wednesday, November 4, as if it had
        // got past the checks while the request waited.
        var away = await JsonAsync(await f.Dad.PostAsync(Events(f), new
        {
            category = "Unavailable",
            startsAt = _wednesday.AddDays(6),
            endsAt = _wednesday.AddDays(6).AddHours(2),
        }));
        await api.QueryScalarAsync<int>(
            "UPDATE calendar.events SET starts_at = @starts, ends_at = @ends WHERE id = @id RETURNING 1",
            ("starts", _wednesday.AddDays(7).UtcDateTime), ("ends", _wednesday.AddDays(7).AddHours(2).UtcDateTime),
            ("id", away.GetProperty("id").GetGuid()));

        var approved = await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{first.GetProperty("changeRequestId").GetGuid()}/approve");

        Assert.Equal(HttpStatusCode.Conflict, approved.StatusCode);
        Assert.Contains("unavailable", (await JsonAsync(approved)).GetProperty("detail").GetString());
        Assert.All(await SeriesEventsAsync(f, first), e => Assert.Equal("PendingApproval", e.GetProperty("status").GetString()));
        // The request still waits for Mom's answer.
        Assert.Single((await JsonAsync(await f.Mom.GetAsync($"/api/families/{f.FamilyId}/approvals"))).EnumerateArray());
    }

    [Fact]
    public async Task Declining_repeating_parenting_time_declines_every_date()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var first = await JsonAsync(await f.Dad.PostAsync(Events(f), DadsWednesdays(f, count: 3)));

        var declined = await f.Mom.PostAsync(
            $"/api/families/{f.FamilyId}/approvals/{first.GetProperty("changeRequestId").GetGuid()}/reject", new { comment = "Wednesdays are mine" });
        var dates = await SeriesEventsAsync(f, first);

        Assert.Equal(HttpStatusCode.OK, declined.StatusCode);
        Assert.Equal(3, dates.Count);
        Assert.All(dates, e => Assert.Equal("Rejected", e.GetProperty("status").GetString()));
    }

    [Fact]
    public async Task Repeating_parenting_time_over_its_caregivers_unavailable_time_is_refused_whole_and_series_changes_go_one_date_at_a_time()
    {
        var f = await FamilyAsync();
        using var _ = f;
        // Dad is unavailable on Wednesday, November 4, 9:00 AM to noon.
        await f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = _wednesday.AddDays(7), endsAt = _wednesday.AddDays(7).AddHours(3) });

        // Dad can't have Kai then (#210): no date of the series is added and nothing goes to Mom.
        var refused = await f.Dad.PostAsync(Events(f), DadsWednesdays(f, count: 3));
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.True((await JsonAsync(refused)).GetProperty("errors").TryGetProperty("caregiverUnavailable", out var _));
        Assert.Empty((await JsonAsync(await f.Mom.GetAsync($"/api/families/{f.FamilyId}/approvals"))).EnumerateArray());
        Assert.DoesNotContain(
            await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30)),
            e => e.GetProperty("category").GetString() == "ParentingTime");

        // A confirmed series' later dates aren't changed or cancelled together, which would skip approval.
        var first = await JsonAsync(await f.Dad.PostAsync(Events(f), DadsWednesdays(f, count: 2, weeksLater: 3)));
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{first.GetProperty("changeRequestId").GetGuid()}/approve");
        var id = first.GetProperty("id").GetGuid();
        var moved = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}?scope=all", new { title = "Dad's Wednesdays" });
        var cancelled = await f.Dad.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}?scope=following");

        Assert.Equal(HttpStatusCode.BadRequest, moved.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, cancelled.StatusCode);
        Assert.All(await SeriesEventsAsync(f, first), e => Assert.Equal("Time with Dad", e.GetProperty("title").GetString()));
        Assert.All(await SeriesEventsAsync(f, first), e => Assert.Equal("Confirmed", e.GetProperty("status").GetString()));
    }

    /// <summary>Dad's parenting time with Kai, Wednesdays 9:00 AM to 5:00 PM, weekly.</summary>
    private static object DadsWednesdays(Family f, int count, int weeksLater = 0) => new
    {
        category = "ParentingTime",
        title = "Time with Dad",
        startsAt = _wednesday.AddDays(7 * weeksLater),
        endsAt = _wednesday.AddDays(7 * weeksLater).AddHours(8),
        childIds = new[] { f.KaiId },
        caregiverMembershipId = f.DadMembershipId,
        repeat = new { frequency = "Weekly", interval = 1, days = _wednesdays, count },
    };

    /// <summary>Every date of the series <paramref name="first"/> belongs to, as Dad sees them.</summary>
    private static async Task<List<JsonElement>> SeriesEventsAsync(Family f, JsonElement first)
    {
        var series = first.GetProperty("seriesId").GetGuid();
        return (await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(60)))
            .Where(e => e.TryGetProperty("seriesId", out var id) && id.ValueKind == JsonValueKind.String && id.GetGuid() == series)
            .ToList();
    }

    /// <summary>The start of every date in the series <paramref name="first"/> belongs to, in order.</summary>
    private static async Task<List<DateTimeOffset>> SeriesStartsAsync(Family f, JsonElement first)
    {
        var series = first.GetProperty("seriesId").GetGuid();
        var all = await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(60));
        all.AddRange(await RangeAsync(f.Dad, f, _wednesday.AddDays(60), _wednesday.AddDays(120)));
        all.AddRange(await RangeAsync(f.Dad, f, _wednesday.AddDays(120), _wednesday.AddDays(180)));
        return all.Where(e => e.TryGetProperty("seriesId", out var id) && id.ValueKind == JsonValueKind.String && id.GetGuid() == series)
            .Select(e => e.GetProperty("startsAt").GetDateTimeOffset())
            .Distinct()
            .OrderBy(d => d)
            .ToList();
    }

    private static object Unavailable(object repeat) =>
        new { category = "Unavailable", startsAt = _wednesday, endsAt = _wednesday.AddHours(3), repeat };

    /// <summary>Swim lessons, Wednesdays 5:00–6:00 PM, four times from October 28. Returns the dates' ids in order.</summary>
    private static async Task<List<Guid>> SwimSeriesAsync(Family f)
    {
        var created = await f.Dad.PostAsync(Events(f), new
        {
            category = "Activity",
            title = "Swim lessons",
            startsAt = _wednesday.AddHours(8),
            endsAt = _wednesday.AddHours(9),
            childIds = new[] { f.KaiId },
            repeat = new { days = _wednesdays, count = 4 },
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        return (await RangeAsync(f.Dad, f, _wednesday.AddDays(-1), _wednesday.AddDays(30))).Select(e => e.GetProperty("id").GetGuid()).ToList();
    }

    private static DateTimeOffset Utc(int month, int day, int hour) => new(2026, month, day, hour, 0, 0, TimeSpan.Zero);

    private static string Events(Family f) => $"/api/families/{f.FamilyId}/calendar/events";

    private static string Q(DateTimeOffset value) => Uri.EscapeDataString(value.ToString("O"));

    private static async Task<List<JsonElement>> RangeAsync(ApiSession session, Family f, DateTimeOffset from, DateTimeOffset to) =>
        (await JsonAsync(await session.GetAsync($"{Events(f)}?from={Q(from)}&to={Q(to)}"))).EnumerateArray().ToList();

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
