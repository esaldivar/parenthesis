using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>The shared calendar (C-01, AP-03; docs/design/CALENDAR_DECISIONS.md).</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class CalendarTests(ApiFactory api) : IAsyncLifetime
{
    private static readonly DateTimeOffset _monday = new(2026, 10, 12, 0, 0, 0, TimeSpan.FromHours(-5));

    private static readonly string[] _mondays = ["Monday"];

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task An_activity_is_confirmed_at_once_and_both_parents_see_it()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), Activity("Soccer Practice", f.KaiId)));
        var momsWeek = await WeekAsync(f.Mom, f);

        Assert.Equal("Confirmed", created.GetProperty("status").GetString());
        var soccer = Assert.Single(momsWeek);
        Assert.Equal("Soccer Practice", soccer.GetProperty("title").GetString());
        Assert.Equal([f.KaiId], soccer.GetProperty("childIds").EnumerateArray().Select(c => c.GetGuid()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task A_family_event_warns_about_the_other_parents_unavailability_but_still_waits_for_approval(bool momProposes)
    {
        var f = await FamilyAsync();
        using var _ = f;
        var sender = momProposes ? f.Mom : f.Dad;
        var other = momProposes ? f.Dad : f.Mom;
        await other.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddHours(18), endsAt = _monday.AddHours(20), notes = "Private appointment" });
        var response = await sender.PostAsync(Events(f), Joint("School Play", f.KaiId));
        var created = await JsonAsync(response);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("PendingApproval", created.GetProperty("status").GetString());
        Assert.Contains("OverlapsCoParentUnavailable", created.GetProperty("warnings").EnumerateArray().Select(w => w.GetString()));
        Assert.DoesNotContain("Private appointment", created.GetRawText(), StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, (await other.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        var adjacent = await JsonAsync(await sender.PostAsync(Events(f), new { category = "Joint", title = "Afterwards", startsAt = _monday.AddHours(20), endsAt = _monday.AddHours(21) }));
        Assert.Empty(adjacent.GetProperty("warnings").EnumerateArray());
        var ordinary = await JsonAsync(await sender.PostAsync(Events(f), new { category = "Activity", title = "Practice", startsAt = _monday.AddHours(18), endsAt = _monday.AddHours(19) }));
        Assert.Equal("Confirmed", ordinary.GetProperty("status").GetString());
        Assert.Empty(ordinary.GetProperty("warnings").EnumerateArray());
    }

    [Fact]
    public async Task Parenting_time_waits_for_the_other_parent_then_is_confirmed()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.KaiId)));
        var pending = Assert.Single(await WeekAsync(f.Mom, f));
        var approved = await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve");

        Assert.Equal("PendingApproval", created.GetProperty("status").GetString());
        Assert.Equal("PendingApproval", pending.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal("Confirmed", Assert.Single(await WeekAsync(f.Dad, f)).GetProperty("status").GetString());
    }

    [Fact]
    public async Task A_declined_joint_event_whose_dates_have_passed_isnt_shown()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), Joint("School Play", f.KaiId)));

        var rejected = await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/reject");

        Assert.Equal("PendingApproval", created.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
        Assert.Empty(await WeekAsync(f.Dad, f));
    }

    [Fact]
    public async Task Before_the_co_parent_joins_parenting_time_is_confirmed_and_labelled_but_a_joint_event_waits()
    {
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync();
        var dadMembership = (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}")))
            .GetProperty("members")[0].GetProperty("membershipId").GetGuid();

        // Children need both parents (ADR-0006), so these events don't name any yet.
        var holiday = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/calendar/events", new
        {
            category = "Holiday",
            title = "Thanksgiving",
            startsAt = _monday,
            endsAt = _monday.AddDays(1),
            allDay = true,
        }));
        var joint = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/calendar/events", new
        {
            category = "Joint",
            title = "Parent-teacher night",
            startsAt = _monday.AddHours(18),
            endsAt = _monday.AddHours(19),
        }));

        Assert.Equal("Confirmed", holiday.GetProperty("status").GetString());
        Assert.True(holiday.GetProperty("confirmedBeforeCoParentJoined").GetBoolean());
        Assert.Equal("PendingApproval", joint.GetProperty("status").GetString());
        Assert.NotEqual(Guid.Empty, dadMembership);
    }

    [Fact]
    public async Task Unavailable_time_is_visible_to_both_but_its_notes_only_to_its_owner()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var created = await f.Dad.PostAsync(Events(f), new
        {
            category = "Unavailable",
            startsAt = _monday.AddHours(8),
            endsAt = _monday.AddHours(17),
            notes = "Work trip to Denver",
        });
        var dads = Assert.Single(await WeekAsync(f.Dad, f));
        var moms = Assert.Single(await WeekAsync(f.Mom, f));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal("Unavailable", moms.GetProperty("title").GetString());
        Assert.Equal("Work trip to Denver", dads.GetProperty("notes").GetString());
        Assert.Equal(JsonValueKind.Null, moms.GetProperty("notes").ValueKind);
    }

    [Fact]
    public async Task Unavailable_time_never_shares_a_title_or_place_even_when_a_request_sends_them()
    {
        var f = await FamilyAsync();
        using var _ = f;

        // A client that sends a private reason as the title or a place: neither is kept, one-off or repeating.
        var oneOff = await JsonAsync(await f.Dad.PostAsync(Events(f), new
        {
            category = "Unavailable",
            title = "Doctor appointment",
            location = "North Clinic",
            startsAt = _monday.AddHours(8),
            endsAt = _monday.AddHours(10),
        }));
        await f.Dad.PostAsync(Events(f), new
        {
            category = "Unavailable",
            title = "Therapy",
            location = "Downtown",
            startsAt = _monday.AddHours(12),
            endsAt = _monday.AddHours(13),
            repeat = new { days = _mondays, count = 2 },
        });
        var edited = await f.Dad.SendAsync(
            HttpMethod.Patch, $"{Events(f)}/{oneOff.GetProperty("id").GetGuid()}", new { title = "Court date", location = "Courthouse" });

        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        foreach (var session in new[] { f.Dad, f.Mom })
        {
            var week = await WeekAsync(session, f);
            Assert.Equal(2, week.Count);
            Assert.All(week, e =>
            {
                Assert.Equal("Unavailable", e.GetProperty("title").GetString());
                Assert.Equal(JsonValueKind.Null, e.GetProperty("location").ValueKind);
            });
        }
    }

    [Fact]
    public async Task A_child_sees_only_confirmed_events_that_include_them()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await f.Dad.PostAsync(Events(f), Activity("Soccer Practice", f.KaiId));
        await f.Dad.PostAsync(Events(f), Activity("Piano Lesson", f.AuroraId));
        await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.KaiId));
        await f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddHours(8), endsAt = _monday.AddHours(9), notes = "Private" });
        // A declined request (#199) that parents still see: always ahead of the real clock.
        var later = new DateTimeOffset(DateTime.UtcNow.Date.AddDays(14), TimeSpan.Zero);
        var declined = await JsonAsync(await f.Dad.PostAsync(Events(f), new
        {
            category = "ParentingTime",
            title = "Long weekend with Dad",
            startsAt = later,
            endsAt = later.AddDays(2),
            allDay = true,
            childIds = new[] { f.KaiId },
            caregiverMembershipId = f.DadMembershipId,
        }));
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{declined.GetProperty("changeRequestId").GetGuid()}/reject");
        var laterRange = $"{Events(f)}?from={Q(later.AddDays(-1))}&to={Q(later.AddDays(7))}";
        using var kai = await KaiSignedInAsync(f);

        var kaisWeek = await WeekAsync(kai, f);
        var kaisLater = (await JsonAsync(await kai.GetAsync(laterRange))).EnumerateArray().ToList();
        var dadsLater = (await JsonAsync(await f.Dad.GetAsync(laterRange))).EnumerateArray().ToList();

        Assert.Equal(["Soccer Practice"], kaisWeek.Select(e => e.GetProperty("title").GetString()));
        Assert.All(kaisWeek, e => Assert.Equal(JsonValueKind.Null, e.GetProperty("notes").ValueKind));
        Assert.Equal(HttpStatusCode.Forbidden, (await kai.PostAsync(Events(f), Activity("Sleepover", f.KaiId))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await kai.PostAsync($"{Events(f)}/{declined.GetProperty("id").GetGuid()}/swap", new { startsAt = later.AddDays(7), endsAt = later.AddDays(9) })).StatusCode);
        Assert.Empty(kaisLater);
        Assert.Equal("Rejected", Assert.Single(dadsLater).GetProperty("status").GetString());
        Assert.Equal(
            HttpStatusCode.Forbidden,
            (await kai.PostAsync($"{Events(f)}/{declined.GetProperty("id").GetGuid()}/dismiss")).StatusCode);
    }

    [Theory]
    [InlineData("end-before-start")]
    [InlineData("unknown-child")]
    [InlineData("someone-elses-time")]
    [InlineData("unavailable-with-children")]
    public async Task Invalid_events_are_rejected(string problem)
    {
        var f = await FamilyAsync();
        using var _ = f;
        object body = problem switch
        {
            "end-before-start" => new { category = "Activity", title = "Oops", startsAt = _monday.AddHours(10), endsAt = _monday.AddHours(9) },
            "unknown-child" => Activity("Mystery", Guid.CreateVersion7()),
            // Each parent adds only their own parenting time (#246).
            "someone-elses-time" => new
            {
                category = "ParentingTime",
                title = "Time",
                startsAt = _monday,
                endsAt = _monday.AddDays(2),
                childIds = new[] { f.KaiId },
                caregiverMembershipId = f.MomMembershipId,
            },
            _ => new { category = "Unavailable", startsAt = _monday, endsAt = _monday.AddHours(2), childIds = new[] { f.KaiId } },
        };

        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.PostAsync(Events(f), body)).StatusCode);
    }

    // The remaining validation rules and their boundaries (#98), so later work can't loosen them unnoticed. Each refused
    // request names the field that's wrong.
    [Theory]
    [InlineData("missing-category", "category")]
    [InlineData("empty-title", "title")]
    [InlineData("whitespace-title", "title")]
    [InlineData("title-121", "title")]
    [InlineData("location-201", "location")]
    [InlineData("notes-1001", "notes")]
    [InlineData("longer-than-31-days", "endsAt")]
    [InlineData("parenting-time-without-children", "childIds")]
    [InlineData("caregiver-not-a-parent", "caregiverMembershipId")]
    public async Task Each_invalid_event_names_the_field_that_is_wrong(string problem, string field)
    {
        var f = await FamilyAsync();
        using var _ = f;
        object body = problem switch
        {
            "missing-category" => new { title = "Soccer", startsAt = _monday.AddHours(17), endsAt = _monday.AddHours(18) },
            "empty-title" => ActivityWith(title: ""),
            "whitespace-title" => ActivityWith(title: "   "),
            "title-121" => ActivityWith(title: new string('a', 121)),
            "location-201" => ActivityWith(location: new string('a', 201)),
            "notes-1001" => ActivityWith(notes: new string('a', 1001)),
            "longer-than-31-days" => ActivityWith(endsAt: _monday.AddHours(17).AddDays(31).AddMinutes(1)),
            "parenting-time-without-children" => new
            {
                category = "ParentingTime",
                title = "Time with Dad",
                startsAt = _monday,
                endsAt = _monday.AddDays(2),
                childIds = Array.Empty<Guid>(),
                caregiverMembershipId = f.DadMembershipId,
            },
            // A child's id, or anyone else's, is not a parent in this family.
            _ => new
            {
                category = "ParentingTime",
                title = "Time with Kai",
                startsAt = _monday,
                endsAt = _monday.AddDays(2),
                childIds = new[] { f.KaiId },
                caregiverMembershipId = f.KaiId,
            },
        };

        var response = await f.Dad.PostAsync(Events(f), body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty(field, out var _), $"{problem}: no {field} error");
        Assert.Empty(await WeekAsync(f.Dad, f));
    }

    [Theory]
    [InlineData("ParentingTime")]
    [InlineData("Holiday")]
    [InlineData("Joint")]
    public async Task Every_other_required_title_category_rejects_blank_creation(string category)
    {
        var f = await FamilyAsync();
        using var _ = f;
        foreach (var title in new[] { "", "   " })
        {
            var response = await f.Dad.PostAsync(Events(f), new
            {
                category,
                title,
                startsAt = _monday,
                endsAt = _monday.AddDays(1),
                childIds = new[] { f.KaiId },
                caregiverMembershipId = category == "ParentingTime" ? (Guid?)f.DadMembershipId : null,
            });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty("title", out var _));
            Assert.Empty(await WeekAsync(f.Dad, f));
        }
    }

    [Fact]
    public async Task The_boundaries_are_accepted()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var longestTitle = await f.Dad.PostAsync(Events(f), ActivityWith(title: new string('a', 120), location: new string('b', 200), notes: new string('c', 1000)));
        var exactly31Days = await f.Dad.PostAsync(Events(f), ActivityWith(endsAt: _monday.AddHours(17).AddDays(31)));
        var untitledUnavailable = await f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddHours(8), endsAt = _monday.AddHours(12) });

        Assert.Equal(HttpStatusCode.Created, longestTitle.StatusCode);
        Assert.Equal(HttpStatusCode.Created, exactly31Days.StatusCode);
        Assert.Equal(HttpStatusCode.Created, untitledUnavailable.StatusCode);
    }

    [Theory]
    [InlineData("end-before-start", "endsAt")]
    [InlineData("longer-than-31-days", "endsAt")]
    [InlineData("title-121", "title")]
    [InlineData("empty-title", "title")]
    [InlineData("whitespace-title", "title")]
    public async Task An_invalid_edit_names_the_field_and_changes_nothing(string problem, string field)
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = (await JsonAsync(await f.Dad.PostAsync(Events(f), Activity("Soccer Practice", f.KaiId)))).GetProperty("id").GetGuid();
        var before = (await JsonAsync(await f.Dad.GetAsync($"{Events(f)}/{id}"))).ToString();
        object change = problem switch
        {
            "end-before-start" => new { startsAt = _monday.AddHours(18), endsAt = _monday.AddHours(17), location = "Must not save", notes = "Must not save" },
            "longer-than-31-days" => new { endsAt = _monday.AddDays(32), location = "Must not save", notes = "Must not save" },
            "empty-title" => new { title = "", location = "Field 3", notes = "Must not save" },
            "whitespace-title" => new { title = "   ", location = "Field 3", notes = "Must not save" },
            _ => new { title = new string('a', 121) },
        };

        var response = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", change);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty(field, out var _), $"{problem}: no {field} error");
        Assert.Equal(before, (await JsonAsync(await f.Dad.GetAsync($"{Events(f)}/{id}"))).ToString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task An_omitted_or_null_title_in_an_edit_keeps_the_current_title(bool sendNull)
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = (await JsonAsync(await f.Dad.PostAsync(Events(f), Activity("Soccer Practice", f.KaiId)))).GetProperty("id").GetGuid();
        object change = sendNull ? new { title = (string?)null, location = "Field 3" } : new { location = "Field 3" };

        var response = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", change);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var saved = await JsonAsync(response);
        Assert.Equal("Soccer Practice", saved.GetProperty("title").GetString());
        Assert.Equal("Field 3", saved.GetProperty("location").GetString());
    }

    [Theory]
    [InlineData("ParentingTime")]
    [InlineData("Holiday")]
    [InlineData("Joint")]
    public async Task A_blank_required_title_cannot_create_an_edit_proposal_or_save_notes(string category)
    {
        var f = await FamilyAsync();
        using var _ = f;
        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), new
        {
            category,
            title = "Family time",
            startsAt = _monday,
            endsAt = _monday.AddDays(1),
            allDay = true,
            childIds = new[] { f.KaiId },
            caregiverMembershipId = category == "ParentingTime" ? (Guid?)f.DadMembershipId : null,
        }));
        var id = created.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await f.Mom.PostAsync(
            $"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        var before = (await JsonAsync(await f.Dad.GetAsync($"{Events(f)}/{id}"))).ToString();

        foreach (var title in new[] { "", "   " })
        {
            var response = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new
            {
                title,
                location = "Must not save",
                notes = "Must not save",
                endsAt = _monday.AddDays(2),
            });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty("title", out var _));
            Assert.Equal(before, (await JsonAsync(await f.Dad.GetAsync($"{Events(f)}/{id}"))).ToString());
        }
    }

    [Theory]
    [InlineData("this")]
    [InlineData("following")]
    [InlineData("all")]
    public async Task A_blank_title_in_a_repeating_edit_changes_no_occurrence(string scope)
    {
        var f = await FamilyAsync();
        using var _ = f;
        Assert.Equal(HttpStatusCode.Created, (await f.Dad.PostAsync(Events(f), new
        {
            category = "Activity",
            title = "Soccer practice",
            startsAt = _monday.AddHours(17),
            endsAt = _monday.AddHours(18),
            childIds = new[] { f.KaiId },
            repeat = new { days = _mondays, count = 3 },
        })).StatusCode);
        var range = $"{Events(f)}?from={Q(_monday)}&to={Q(_monday.AddDays(21))}";
        var before = (await JsonAsync(await f.Dad.GetAsync(range))).ToString();
        var occurrences = (await JsonAsync(await f.Dad.GetAsync(range))).EnumerateArray().ToList();
        Assert.Equal(3, occurrences.Count);
        var id = occurrences[1].GetProperty("id").GetGuid();

        foreach (var title in new[] { "", "   " })
        {
            var response = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}?scope={scope}", new
            {
                title,
                location = "Must not save",
                notes = "Must not save",
            });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty("title", out var _));
            Assert.Equal(before, (await JsonAsync(await f.Dad.GetAsync(range))).ToString());
        }

        // Omitting the title still permits the scoped edit and preserves every occurrence's title.
        var accepted = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}?scope={scope}", new { location = "Field 3" });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var after = (await JsonAsync(await f.Dad.GetAsync(range))).EnumerateArray().ToList();
        Assert.All(after, e => Assert.Equal("Soccer practice", e.GetProperty("title").GetString()));
        Assert.Equal(scope == "all" ? 3 : scope == "following" ? 2 : 1,
            after.Count(e => e.GetProperty("location").GetString() == "Field 3"));
    }

    [Theory]
    [InlineData("this")]
    [InlineData("following")]
    [InlineData("all")]
    public async Task Unavailable_edits_accept_blank_titles_without_sharing_private_fields(string scope)
    {
        var f = await FamilyAsync();
        using var _ = f;
        Assert.Equal(HttpStatusCode.Created, (await f.Dad.PostAsync(Events(f), new
        {
            category = "Unavailable",
            startsAt = _monday.AddHours(8),
            endsAt = _monday.AddHours(9),
            repeat = new { days = _mondays, count = 2 },
        })).StatusCode);
        var id = Assert.Single(await WeekAsync(f.Dad, f)).GetProperty("id").GetGuid();
        foreach (var title in new[] { "", "   " })
        {
            var response = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}?scope={scope}", new
            {
                title,
                location = "Private clinic",
                notes = "Private reason",
            });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }

        var range = $"{Events(f)}?from={Q(_monday)}&to={Q(_monday.AddDays(14))}";
        var visible = (await JsonAsync(await f.Mom.GetAsync(range))).EnumerateArray().ToList();
        Assert.Equal(2, visible.Count);
        Assert.All(visible, e =>
        {
            Assert.Equal("Unavailable", e.GetProperty("title").GetString());
            Assert.Equal(JsonValueKind.Null, e.GetProperty("location").ValueKind);
            Assert.Equal(JsonValueKind.Null, e.GetProperty("notes").ValueKind);
        });
        Assert.Equal("Private reason", (await JsonAsync(await f.Dad.GetAsync($"{Events(f)}/{id}"))).GetProperty("notes").GetString());
    }

    [Fact]
    public async Task A_list_range_is_required_to_be_sensible()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var backwards = await f.Dad.GetAsync($"{Events(f)}?from={Q(_monday)}&to={Q(_monday.AddDays(-1))}");
        var tooWide = await f.Dad.GetAsync($"{Events(f)}?from={Q(_monday)}&to={Q(_monday.AddDays(120))}");

        Assert.Equal(HttpStatusCode.BadRequest, backwards.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooWide.StatusCode);
    }

    [Fact]
    public async Task An_activity_is_edited_and_cancelled_at_once()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = (await JsonAsync(await f.Dad.PostAsync(Events(f), Activity("Soccer Practice", f.KaiId)))).GetProperty("id").GetGuid();

        var edited = await f.Mom.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { title = "Soccer Game", location = "Field 3" });
        var cancelled = await f.Mom.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}");

        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.Equal("Soccer Game", (await JsonAsync(edited)).GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.NoContent, cancelled.StatusCode);
        Assert.Empty(await WeekAsync(f.Dad, f));
    }

    [Fact]
    public async Task A_swap_keeps_the_current_parenting_time_until_the_other_parent_approves()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f);

        var swap = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { startsAt = _monday.AddDays(1) });
        var proposal = await JsonAsync(swap);
        var whileWaiting = Assert.Single(await WeekAsync(f.Mom, f));
        var approved = await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{proposal.GetProperty("changeRequestId").GetGuid()}/approve");
        var after = Assert.Single(await WeekAsync(f.Dad, f));

        Assert.Equal(HttpStatusCode.Accepted, swap.StatusCode);
        Assert.Equal("Modify", whileWaiting.GetProperty("pendingChange").GetString());
        Assert.Equal(_monday, whileWaiting.GetProperty("startsAt").GetDateTimeOffset()); // Before.
        Assert.Equal(_monday.AddDays(1), whileWaiting.GetProperty("proposed").GetProperty("startsAt").GetDateTimeOffset()); // After.
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal(_monday.AddDays(1), after.GetProperty("startsAt").GetDateTimeOffset());
        Assert.Equal(f.DadMembershipId, after.GetProperty("caregiverMembershipId").GetGuid());
        Assert.Equal("None", after.GetProperty("pendingChange").GetString());
    }

    [Fact]
    public async Task A_declined_swap_changes_nothing()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f);
        var proposal = await JsonAsync(await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { startsAt = _monday.AddDays(1) }));

        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{proposal.GetProperty("changeRequestId").GetGuid()}/reject");
        var after = Assert.Single(await WeekAsync(f.Dad, f));

        Assert.Equal(_monday, after.GetProperty("startsAt").GetDateTimeOffset());
        Assert.Equal("None", after.GetProperty("pendingChange").GetString());
    }

    [Fact]
    public async Task A_swap_reason_travels_with_the_request_to_both_parents()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f);

        var tooLong = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { startsAt = _monday.AddDays(1), reason = new string('x', 501) });
        var swap = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { startsAt = _monday.AddDays(1), reason = "  I have a work trip that weekend.  " });
        var momInbox = Assert.Single((await JsonAsync(await f.Mom.GetAsync($"/api/families/{f.FamilyId}/approvals"))).EnumerateArray());
        var dadInbox = Assert.Single((await JsonAsync(await f.Dad.GetAsync($"/api/families/{f.FamilyId}/approvals"))).EnumerateArray());

        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, swap.StatusCode);
        Assert.Equal("I have a work trip that weekend.", momInbox.GetProperty("reason").GetString());
        Assert.Equal(id, momInbox.GetProperty("targetId").GetGuid());
        Assert.Equal("I have a work trip that weekend.", dadInbox.GetProperty("reason").GetString());
    }

    [Fact]
    public async Task Checking_a_swap_for_conflicts_warns_and_changes_nothing()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f);
        await f.Mom.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddDays(8), endsAt = _monday.AddDays(9), allDay = true });

        var clash = await f.Dad.GetAsync($"{Events(f)}/{id}/conflicts?startsAt={Q(_monday.AddDays(7))}&endsAt={Q(_monday.AddDays(10))}");
        var clear = await f.Dad.GetAsync($"{Events(f)}/{id}/conflicts?startsAt={Q(_monday.AddDays(1))}&endsAt={Q(_monday.AddDays(6))}");
        var backwards = await f.Dad.GetAsync($"{Events(f)}/{id}/conflicts?startsAt={Q(_monday.AddDays(2))}&endsAt={Q(_monday.AddDays(1))}");
        var after = await JsonAsync(await f.Dad.GetAsync($"{Events(f)}/{id}"));

        Assert.Equal(["OverlapsCoParentUnavailable"], (await JsonAsync(clash)).GetProperty("warnings").EnumerateArray().Select(w => w.GetString()));
        // The event's own time doesn't count against itself.
        Assert.Empty((await JsonAsync(clear)).GetProperty("warnings").EnumerateArray());
        Assert.Equal(HttpStatusCode.BadRequest, backwards.StatusCode);
        Assert.Equal("None", after.GetProperty("pendingChange").GetString());
        Assert.Equal(_monday, after.GetProperty("startsAt").GetDateTimeOffset());
    }

    [Fact]
    public async Task One_event_is_shown_to_parents_but_not_to_a_child()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f);
        using var kai = await KaiSignedInAsync(f);

        var mom = await f.Mom.GetAsync($"{Events(f)}/{id}");
        var missing = await f.Mom.GetAsync($"{Events(f)}/{Guid.CreateVersion7()}");
        var child = await kai.GetAsync($"{Events(f)}/{id}");
        var childConflicts = await kai.GetAsync($"{Events(f)}/{id}/conflicts?startsAt={Q(_monday)}&endsAt={Q(_monday.AddDays(1))}");

        Assert.Equal("Time with Dad", (await JsonAsync(mom)).GetProperty("title").GetString());
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, child.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, childConflicts.StatusCode);
    }

    [Fact]
    public async Task Cancelling_parenting_time_needs_the_other_parent_and_a_second_request_waits()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f);

        var cancel = await JsonAsync(await f.Dad.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}"));
        var secondChange = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { title = "Longer weekend" });
        var stillThere = Assert.Single(await WeekAsync(f.Mom, f));
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{cancel.GetProperty("changeRequestId").GetGuid()}/approve");

        Assert.Equal("Cancel", stillThere.GetProperty("pendingChange").GetString());
        Assert.Equal(HttpStatusCode.Conflict, secondChange.StatusCode);
        Assert.Empty(await WeekAsync(f.Mom, f));
    }

    [Fact]
    public async Task Proposing_your_parenting_time_over_the_other_parents_unavailable_time_warns_without_blocking()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await f.Mom.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddDays(2), endsAt = _monday.AddDays(3), allDay = true });

        var created = await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.KaiId));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal(
            ["OverlapsCoParentUnavailable"],
            (await JsonAsync(created)).GetProperty("warnings").EnumerateArray().Select(w => w.GetString()));
    }

    [Fact]
    public async Task Only_its_owner_can_change_unavailable_time()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = (await JsonAsync(await f.Mom.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday, endsAt = _monday.AddHours(4) })))
            .GetProperty("id").GetGuid();

        Assert.Equal(HttpStatusCode.NotFound, (await f.Dad.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await f.Mom.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}")).StatusCode);
    }

    [Fact]
    public async Task Overlapping_parenting_time_for_the_same_child_is_flagged_but_not_blocked()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await ConfirmedParentingTimeAsync(f);

        var overlapping = await f.Mom.PostAsync(Events(f), new
        {
            category = "ParentingTime",
            title = "Time with Mom",
            startsAt = _monday.AddDays(2),
            endsAt = _monday.AddDays(4),
            childIds = new[] { f.KaiId },
            caregiverMembershipId = f.MomMembershipId,
        });
        var otherChild = await f.Mom.PostAsync(Events(f), new
        {
            category = "ParentingTime",
            title = "Time with Mom",
            startsAt = _monday.AddDays(2),
            endsAt = _monday.AddDays(4),
            childIds = new[] { f.AuroraId },
            caregiverMembershipId = f.MomMembershipId,
        });

        Assert.Equal(HttpStatusCode.Created, overlapping.StatusCode);
        Assert.Contains("OverlapsParentingTime", (await JsonAsync(overlapping)).GetProperty("warnings").EnumerateArray().Select(w => w.GetString()));
        Assert.DoesNotContain("OverlapsParentingTime", (await JsonAsync(otherChild)).GetProperty("warnings").EnumerateArray().Select(w => w.GetString()));
    }

    // A parent can't have the children and be unavailable at the same time (owner decisions, October 22, 2026; #210).

    [Fact]
    public async Task Parenting_time_cant_overlap_its_caregivers_unavailable_time_and_nobody_adds_it_for_them()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await f.Mom.PostAsync(Events(f), new
        {
            category = "Unavailable",
            startsAt = _monday.AddDays(2),
            endsAt = _monday.AddDays(3),
            allDay = true,
            notes = "Surgery follow-up",
        });

        var byDad = await f.Dad.PostAsync(Events(f), ParentingTime("Time with Mom", f.MomMembershipId, f.KaiId));
        var byMom = await f.Mom.PostAsync(Events(f), ParentingTime("Time with Mom", f.MomMembershipId, f.KaiId));

        // Dad can't add Mom's parenting time at all (#246); Mom can't add hers while she's unavailable (#210).
        Assert.Equal(HttpStatusCode.BadRequest, byDad.StatusCode);
        Assert.True((await JsonAsync(byDad)).GetProperty("errors").TryGetProperty("caregiverMembershipId", out var _));
        Assert.Equal(HttpStatusCode.BadRequest, byMom.StatusCode);
        Assert.True((await JsonAsync(byMom)).GetProperty("errors").TryGetProperty("caregiverUnavailable", out var _));
        // Never the unavailable time's private details.
        Assert.DoesNotContain("Surgery", await byMom.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.OrdinalIgnoreCase);

        // Nothing was added or sent for approval.
        Assert.DoesNotContain(await WeekAsync(f.Dad, f), e => e.GetProperty("category").GetString() == "ParentingTime");
        var inbox = await JsonAsync(await f.Dad.GetAsync($"/api/families/{f.FamilyId}/approvals"));
        Assert.DoesNotContain(inbox.EnumerateArray(), r => r.GetProperty("summary").GetString()!.Contains("Time with Mom", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Unavailable_time_cant_overlap_your_own_pending_or_confirmed_parenting_time()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var pending = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.KaiId)));
        var tuesday = new { category = "Unavailable", startsAt = _monday.AddDays(1), endsAt = _monday.AddDays(2), allDay = true };

        var whilePending = await f.Dad.PostAsync(Events(f), tuesday);
        var moms = await f.Mom.PostAsync(Events(f), tuesday);
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{pending.GetProperty("changeRequestId").GetGuid()}/approve");
        var onceConfirmed = await f.Dad.PostAsync(Events(f), tuesday);

        Assert.Equal(HttpStatusCode.BadRequest, whilePending.StatusCode);
        Assert.True((await JsonAsync(whilePending)).GetProperty("errors").TryGetProperty("overlapsYourParentingTime", out var _));
        Assert.Equal(HttpStatusCode.BadRequest, onceConfirmed.StatusCode);
        // The other parent's unavailable time is theirs to mark: no warning, nothing blocked.
        Assert.Equal(HttpStatusCode.Created, moms.StatusCode);
        Assert.Empty((await JsonAsync(moms)).GetProperty("warnings").EnumerateArray());
    }

    [Fact]
    public async Task Requests_at_the_same_moment_cant_both_create_the_overlap()
    {
        // Copilot release review, #224: the check and the save run under a lock on the parent, so of two requests sent
        // together (Dad marks himself unavailable, and proposes his own parenting time then, from two tabs), at most
        // one succeeds. Only Dad adds his own parenting time (#246).
        var f = await FamilyAsync();
        using var _ = f;
        for (var week = 1; week <= 5; week++)
        {
            var day = _monday.AddDays(7 * week + 1);
            var unavailable = f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = day, endsAt = day.AddDays(1), allDay = true });
            var parenting = f.Dad.PostAsync(Events(f), new
            {
                category = "ParentingTime",
                title = "Time with Dad",
                startsAt = day,
                endsAt = day.AddDays(1),
                allDay = true,
                childIds = new[] { f.KaiId },
                caregiverMembershipId = f.DadMembershipId,
            });

            var results = await Task.WhenAll(unavailable, parenting);

            Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.Created));
            Assert.Equal(1, results.Count(r => r.StatusCode == HttpStatusCode.BadRequest));
        }
    }

    [Fact]
    public async Task Declined_and_withdrawn_parenting_time_dont_block_unavailable_time()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var declined = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.KaiId)));
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{declined.GetProperty("changeRequestId").GetGuid()}/reject");
        var withdrawn = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.AuroraId)));
        await f.Dad.PostAsync($"/api/families/{f.FamilyId}/approvals/{withdrawn.GetProperty("changeRequestId").GetGuid()}/withdraw");

        var unavailable = await f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddDays(1), endsAt = _monday.AddDays(2), allDay = true });

        Assert.Equal(HttpStatusCode.Created, unavailable.StatusCode);
    }

    [Fact]
    public async Task Whose_parenting_time_it_is_never_changes_and_a_waiting_change_counts_for_its_new_dates()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f); // Dad has Kai Monday to Sunday.

        // Neither parent can hand it to the other (#246).
        var byDad = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { caregiverMembershipId = f.MomMembershipId });
        var byMom = await f.Mom.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { caregiverMembershipId = f.MomMembershipId });
        Assert.Equal(HttpStatusCode.BadRequest, byDad.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, byMom.StatusCode);
        Assert.True((await JsonAsync(byDad)).GetProperty("errors").TryGetProperty("caregiverMembershipId", out var _));

        // Dad asks to extend it by a week: until Mom answers, those days count as his too (#210).
        var longer = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { endsAt = _monday.AddDays(14) });
        var dads = await f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddDays(9), endsAt = _monday.AddDays(10), allDay = true });

        Assert.Equal(HttpStatusCode.Accepted, longer.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, dads.StatusCode);
        Assert.Equal(f.DadMembershipId, Assert.Single(await WeekAsync(f.Dad, f)).GetProperty("caregiverMembershipId").GetGuid());
    }

    [Fact]
    public async Task Edits_cant_move_into_an_overlap_but_existing_overlaps_stay_and_can_be_renamed()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var parenting = await ConfirmedParentingTimeAsync(f); // Dad has Kai Monday to Sunday.
        await f.Mom.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddDays(9), endsAt = _monday.AddDays(10), allDay = true });
        var unavailable = (await JsonAsync(await f.Dad.PostAsync(Events(f), new
        {
            category = "Unavailable",
            startsAt = _monday.AddDays(8),
            endsAt = _monday.AddDays(9),
            allDay = true,
        }))).GetProperty("id").GetGuid();

        var movedIn = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{unavailable}", new
        {
            startsAt = _monday.AddDays(1),
            endsAt = _monday.AddDays(2),
        });
        var swappedIn = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{parenting}", new
        {
            startsAt = _monday.AddDays(7),
            endsAt = _monday.AddDays(13),
        });

        Assert.Equal(HttpStatusCode.BadRequest, movedIn.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, swappedIn.StatusCode);
        Assert.True((await JsonAsync(swappedIn)).GetProperty("errors").TryGetProperty("caregiverUnavailable", out var _));

        // An overlap from before this rule (made directly in the database) stays, and a notes-only change still works.
        await api.QueryScalarAsync<int>(
            "UPDATE calendar.events SET starts_at = @starts, ends_at = @ends WHERE id = @id RETURNING 1",
            ("starts", _monday.AddDays(1).UtcDateTime), ("ends", _monday.AddDays(2).UtcDateTime), ("id", unavailable));
        var notes = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{unavailable}", new { notes = "Dentist" });
        var renamed = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{parenting}", new { title = "Week with Dad" });

        Assert.Equal(HttpStatusCode.OK, notes.StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, renamed.StatusCode);
        Assert.Equal(2, (await WeekAsync(f.Dad, f)).Count);
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public async Task Only_the_persisted_caregiver_can_edit_or_cancel_even_when_the_creator_is_different(bool momIsCaregiver, bool legacyCreator)
    {
        var f = await FamilyAsync();
        using var _ = f;
        var caregiver = momIsCaregiver ? f.Mom : f.Dad;
        var other = momIsCaregiver ? f.Dad : f.Mom;
        var caregiverId = momIsCaregiver ? f.MomMembershipId : f.DadMembershipId;
        var otherId = momIsCaregiver ? f.DadMembershipId : f.MomMembershipId;
        var created = await JsonAsync(await caregiver.PostAsync(Events(f), ParentingTime("Caregiver's time", caregiverId, f.KaiId)));
        var id = created.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await other.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        if (legacyCreator)
        {
            await api.QueryScalarAsync<int>("UPDATE calendar.events SET owner_membership_id = @owner WHERE id = @id RETURNING 1", ("owner", otherId), ("id", id));
        }

        var before = (await JsonAsync(await other.GetAsync($"{Events(f)}/{id}"))).GetRawText();
        object[] attempts =
        [
            new { title = "Replaced" },
            new { notes = "Must not change immediately" },
            new { location = "Elsewhere" },
            new { startsAt = _monday.AddDays(7), endsAt = _monday.AddDays(13) },
            new { caregiverMembershipId = caregiverId, notes = "Unchanged caregiver" },
            new { caregiverMembershipId = otherId, notes = "Forged caregiver" },
        ];
        foreach (var scope in new[] { "this", "following", "all" })
        {
            foreach (var attempt in attempts)
            {
                Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}?scope={scope}", attempt)).StatusCode);
            }
            Assert.Equal(HttpStatusCode.NotFound, (await other.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}?scope={scope}")).StatusCode);
        }
        Assert.Equal(before, (await JsonAsync(await other.GetAsync($"{Events(f)}/{id}"))).GetRawText());
        Assert.Empty((await JsonAsync(await caregiver.GetAsync($"/api/families/{f.FamilyId}/approvals"))).EnumerateArray());

        // The caregiver still edits notes immediately and submits material edits for approval.
        Assert.Equal(HttpStatusCode.OK, (await caregiver.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { notes = "School bag" })).StatusCode);
        var pending = await caregiver.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { title = "Updated by caregiver" });
        Assert.Equal(HttpStatusCode.Accepted, pending.StatusCode);
        var requestId = (await JsonAsync(pending)).GetProperty("changeRequestId").GetGuid();
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsync($"/api/families/{f.FamilyId}/approvals/{requestId}/withdraw")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await other.PostAsync($"/api/families/{f.FamilyId}/approvals/{requestId}/approve")).StatusCode);
    }

    [Fact]
    public async Task The_other_parent_can_request_a_dates_only_swap_without_generic_edit_permission()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.Mom.PostAsync($"{Events(f)}/{id}/swap", new { startsAt = _monday, endsAt = _monday.AddDays(6), allDay = true })).StatusCode);

        var response = await f.Mom.PostAsync($"{Events(f)}/{id}/swap", new
        {
            startsAt = _monday.AddDays(7),
            endsAt = _monday.AddDays(13),
            allDay = true,
            reason = "School trip",
            title = "Must be ignored",
            notes = "Must be ignored",
            location = "Must be ignored",
            caregiverMembershipId = f.MomMembershipId,
        });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var pending = await JsonAsync(response);
        Assert.Equal("Time with Dad", pending.GetProperty("title").GetString());
        Assert.Equal(JsonValueKind.Null, pending.GetProperty("notes").ValueKind);
        Assert.Equal("Time with Dad", pending.GetProperty("proposed").GetProperty("title").GetString());
        Assert.Equal(f.DadMembershipId, pending.GetProperty("proposed").GetProperty("caregiverMembershipId").GetGuid());
        var requestId = pending.GetProperty("changeRequestId").GetGuid();
        Assert.Equal(HttpStatusCode.NoContent, (await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{requestId}/withdraw")).StatusCode);

        // A later swap can still be approved by the caregiver; no non-date payload is carried forward.
        var sent = await JsonAsync(await f.Mom.PostAsync($"{Events(f)}/{id}/swap", new { startsAt = _monday.AddDays(7), endsAt = _monday.AddDays(13) }));
        Assert.Equal(HttpStatusCode.OK, (await f.Dad.PostAsync($"/api/families/{f.FamilyId}/approvals/{sent.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        var after = await JsonAsync(await f.Dad.GetAsync($"{Events(f)}/{id}"));
        Assert.Equal(_monday.AddDays(7), after.GetProperty("startsAt").GetDateTimeOffset());
        Assert.Equal(f.DadMembershipId, after.GetProperty("caregiverMembershipId").GetGuid());
        Assert.Equal("Time with Dad", after.GetProperty("title").GetString());
        Assert.Equal(JsonValueKind.Null, after.GetProperty("notes").ValueKind);
        Assert.Equal(JsonValueKind.Null, after.GetProperty("location").ValueKind);
    }

    [Fact]
    public async Task The_other_parent_cannot_edit_or_cancel_any_date_or_scope_of_a_parenting_series()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), new
        {
            category = "ParentingTime",
            title = "Mondays with Dad",
            startsAt = _monday,
            endsAt = _monday.AddDays(1),
            allDay = true,
            caregiverMembershipId = f.DadMembershipId,
            childIds = new[] { f.KaiId },
            repeat = new { days = _mondays, count = 3 },
        }));
        Assert.Equal(HttpStatusCode.OK, (await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        var range = $"{Events(f)}?from={Q(_monday)}&to={Q(_monday.AddDays(21))}";
        var before = (await JsonAsync(await f.Mom.GetAsync(range))).GetRawText();
        using var snapshot = JsonDocument.Parse(before);
        var dates = snapshot.RootElement.EnumerateArray().ToList();
        Assert.Equal(3, dates.Count);
        foreach (var date in dates)
        {
            var id = date.GetProperty("id").GetGuid();
            foreach (var scope in new[] { "this", "following", "all" })
            {
                Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}?scope={scope}", new { notes = "Denied", caregiverMembershipId = f.DadMembershipId })).StatusCode);
                Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.SendAsync(HttpMethod.Delete, $"{Events(f)}/{id}?scope={scope}")).StatusCode);
            }
        }
        Assert.Equal(before, (await JsonAsync(await f.Mom.GetAsync(range))).GetRawText());
        Assert.Empty((await JsonAsync(await f.Dad.GetAsync($"/api/families/{f.FamilyId}/approvals"))).EnumerateArray());
    }

    private static async Task<Guid> ConfirmedParentingTimeAsync(Family f)
    {
        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.KaiId)));
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve");
        return created.GetProperty("id").GetGuid();
    }

    private static object Activity(string title, Guid child) =>
        new { category = "Activity", title, startsAt = _monday.AddHours(17), endsAt = _monday.AddHours(18), childIds = new[] { child } };

    /// <summary>An activity on Monday evening, 5:00 to 6:00 PM unless given another end, with the fields given.</summary>
    private static object ActivityWith(string title = "Soccer", string? location = null, string? notes = null, DateTimeOffset? endsAt = null) =>
        new { category = "Activity", title, startsAt = _monday.AddHours(17), endsAt = endsAt ?? _monday.AddHours(18), location, notes };

    private static object ParentingTime(string title, Guid caregiver, Guid child) => new
    {
        category = "ParentingTime",
        title,
        startsAt = _monday,
        endsAt = _monday.AddDays(6),
        allDay = true,
        childIds = new[] { child },
        caregiverMembershipId = caregiver,
    };

    private static object Joint(string title, Guid child) =>
        new { category = "Joint", title, startsAt = _monday.AddHours(18), endsAt = _monday.AddHours(20), childIds = new[] { child } };

    private static string Events(Family f) => $"/api/families/{f.FamilyId}/calendar/events";

    private static string Q(DateTimeOffset value) => Uri.EscapeDataString(value.ToString("O"));

    private static async Task<List<JsonElement>> WeekAsync(ApiSession session, Family f) =>
        (await JsonAsync(await session.GetAsync($"{Events(f)}?from={Q(_monday)}&to={Q(_monday.AddDays(7))}"))).EnumerateArray().ToList();

    /// <summary>Dad and Mom; Kai and Aurora approved by both.</summary>
    private async Task<Family> FamilyAsync()
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        var aurora = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Aurora" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        await mom.PostAsync("/api/invitations/accept", new { token });
        foreach (var child in new[] { kai, aurora })
        {
            await mom.PostAsync($"/api/families/{familyId}/approvals/{child.GetProperty("changeRequestId").GetGuid()}/approve");
        }

        var members = (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"))).GetProperty("members").EnumerateArray().ToList();
        var dadMembership = members.Single(m => m.GetProperty("displayName").GetString() == "Dad").GetProperty("membershipId").GetGuid();
        var momMembership = members.Single(m => m.GetProperty("displayName").GetString() == "Mom").GetProperty("membershipId").GetGuid();
        return new Family(dad, mom, familyId, kai.GetProperty("id").GetGuid(), aurora.GetProperty("id").GetGuid(), dadMembership, momMembership);
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

    private sealed record Family(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId, Guid AuroraId, Guid DadMembershipId, Guid MomMembershipId)
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
