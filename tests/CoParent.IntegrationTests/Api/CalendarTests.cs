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
    public async Task A_rejected_joint_event_leaves_the_calendar()
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
    public async Task A_child_sees_only_confirmed_events_that_include_them()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await f.Dad.PostAsync(Events(f), Activity("Soccer Practice", f.KaiId));
        await f.Dad.PostAsync(Events(f), Activity("Piano Lesson", f.AuroraId));
        await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.KaiId));
        await f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddHours(8), endsAt = _monday.AddHours(9), notes = "Private" });
        using var kai = await KaiSignedInAsync(f);

        var kaisWeek = await WeekAsync(kai, f);

        Assert.Equal(["Soccer Practice"], kaisWeek.Select(e => e.GetProperty("title").GetString()));
        Assert.All(kaisWeek, e => Assert.Equal(JsonValueKind.Null, e.GetProperty("notes").ValueKind));
        Assert.Equal(HttpStatusCode.Forbidden, (await kai.PostAsync(Events(f), Activity("Sleepover", f.KaiId))).StatusCode);
    }

    [Theory]
    [InlineData("end-before-start")]
    [InlineData("unknown-child")]
    [InlineData("no-caregiver")]
    [InlineData("unavailable-with-children")]
    public async Task Invalid_events_are_rejected(string problem)
    {
        var f = await FamilyAsync();
        using var _ = f;
        object body = problem switch
        {
            "end-before-start" => new { category = "Activity", title = "Oops", startsAt = _monday.AddHours(10), endsAt = _monday.AddHours(9) },
            "unknown-child" => Activity("Mystery", Guid.CreateVersion7()),
            "no-caregiver" => new { category = "ParentingTime", title = "Time", startsAt = _monday, endsAt = _monday.AddDays(2), childIds = new[] { f.KaiId } },
            _ => new { category = "Unavailable", startsAt = _monday, endsAt = _monday.AddHours(2), childIds = new[] { f.KaiId } },
        };

        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.PostAsync(Events(f), body)).StatusCode);
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

        var swap = await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { startsAt = _monday.AddDays(1), caregiverMembershipId = f.MomMembershipId });
        var proposal = await JsonAsync(swap);
        var whileWaiting = Assert.Single(await WeekAsync(f.Mom, f));
        var approved = await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{proposal.GetProperty("changeRequestId").GetGuid()}/approve");
        var after = Assert.Single(await WeekAsync(f.Dad, f));

        Assert.Equal(HttpStatusCode.Accepted, swap.StatusCode);
        Assert.Equal("Modify", whileWaiting.GetProperty("pendingChange").GetString());
        Assert.Equal(f.DadMembershipId, whileWaiting.GetProperty("caregiverMembershipId").GetGuid()); // Before.
        Assert.Equal(f.MomMembershipId, whileWaiting.GetProperty("proposed").GetProperty("caregiverMembershipId").GetGuid()); // After.
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal(f.MomMembershipId, after.GetProperty("caregiverMembershipId").GetGuid());
        Assert.Equal("None", after.GetProperty("pendingChange").GetString());
    }

    [Fact]
    public async Task A_declined_swap_changes_nothing()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await ConfirmedParentingTimeAsync(f);
        var proposal = await JsonAsync(await f.Dad.SendAsync(HttpMethod.Patch, $"{Events(f)}/{id}", new { caregiverMembershipId = f.MomMembershipId }));

        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{proposal.GetProperty("changeRequestId").GetGuid()}/reject");
        var after = Assert.Single(await WeekAsync(f.Dad, f));

        Assert.Equal(f.DadMembershipId, after.GetProperty("caregiverMembershipId").GetGuid());
        Assert.Equal("None", after.GetProperty("pendingChange").GetString());
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
    public async Task Proposing_parenting_time_over_the_other_parents_unavailable_time_warns_without_blocking()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await f.Mom.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddDays(2), endsAt = _monday.AddDays(3), allDay = true });

        var created = await f.Dad.PostAsync(Events(f), ParentingTime("Time with Mom", f.MomMembershipId, f.KaiId));

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        // Mom is both the other parent and the proposed caregiver: two gentle notes, nothing blocked.
        Assert.Equal(
            ["OverlapsCoParentUnavailable", "CaregiverUnavailable"],
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

    [Fact]
    public async Task Marking_yourself_unavailable_during_your_own_parenting_time_is_flagged()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await ConfirmedParentingTimeAsync(f); // Dad has Kai Monday to Sunday.

        var unavailable = await f.Dad.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddDays(1), endsAt = _monday.AddDays(2), allDay = true });
        var momUnavailable = await f.Mom.PostAsync(Events(f), new { category = "Unavailable", startsAt = _monday.AddDays(1), endsAt = _monday.AddDays(2), allDay = true });

        Assert.Equal(["OverlapsYourParentingTime"], (await JsonAsync(unavailable)).GetProperty("warnings").EnumerateArray().Select(w => w.GetString()));
        Assert.Empty((await JsonAsync(momUnavailable)).GetProperty("warnings").EnumerateArray());
    }

    private static async Task<Guid> ConfirmedParentingTimeAsync(Family f)
    {
        var created = await JsonAsync(await f.Dad.PostAsync(Events(f), ParentingTime("Time with Dad", f.DadMembershipId, f.KaiId)));
        await f.Mom.PostAsync($"/api/families/{f.FamilyId}/approvals/{created.GetProperty("changeRequestId").GetGuid()}/approve");
        return created.GetProperty("id").GetGuid();
    }

    private static object Activity(string title, Guid child) =>
        new { category = "Activity", title, startsAt = _monday.AddHours(17), endsAt = _monday.AddHours(18), childIds = new[] { child } };

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
