using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Shared tasks (#73, part 1: #174). Synthetic family only: Dad, Mom and Kai.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class TaskTests(ApiFactory api) : IAsyncLifetime
{
    private const string Friday = "2026-10-16";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Either_parent_creates_edits_and_deletes_at_once_with_no_approval()
    {
        var f = await FamilyAsync();
        using var _ = f;

        var created = await f.Dad.PostAsync(Tasks(f), new { title = "Science fair poster", dueDate = Friday, childId = f.KaiId, details = "Glue and markers" });
        var id = (await JsonAsync(created)).GetProperty("id").GetGuid();
        var momSees = Assert.Single(await WeekAsync(f.Mom, f));
        var edited = await f.Mom.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{id}",
            new { title = "Science fair poster", dueDate = "2026-10-15", childId = f.KaiId, details = "Glue, markers and tape", version = await VersionAsync(f.Mom, f, id) });
        var dadView = await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{id}"));
        var momView = await JsonAsync(await f.Mom.GetAsync($"{Tasks(f)}/{id}"));
        var approvals = await JsonAsync(await f.Mom.GetAsync($"/api/families/{f.FamilyId}/approvals"));
        var deleted = await f.Dad.SendAsync(HttpMethod.Delete, $"{Tasks(f)}/{id}");

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        Assert.Equal("Science fair poster", momSees.GetProperty("title").GetString());
        Assert.Equal(Friday, momSees.GetProperty("dueDate").GetString());
        Assert.Equal(f.KaiId, momSees.GetProperty("childId").GetGuid());
        Assert.Equal(f.DadMembershipId, momSees.GetProperty("createdByMembershipId").GetGuid());
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode);
        Assert.Equal("2026-10-15", dadView.GetProperty("dueDate").GetString());
        // The quiet "edited by" note is for the other parent only.
        Assert.Equal(f.MomMembershipId, dadView.GetProperty("editedBy").GetGuid());
        Assert.Equal(JsonValueKind.Null, momView.GetProperty("editedBy").ValueKind);
        Assert.Empty(approvals.EnumerateArray()); // No approval request, ever.
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Empty(await WeekAsync(f.Mom, f));
        Assert.Equal(HttpStatusCode.NotFound, (await f.Mom.GetAsync($"{Tasks(f)}/{id}")).StatusCode);
    }

    [Fact]
    public async Task Mark_done_is_attributed_to_whoever_did_it_and_can_be_undone()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Return library books");

        // Mom marks it done; the request can't name someone else.
        var done = await JsonAsync(await f.Mom.PostAsync($"{Tasks(f)}/{id}/done", new { membershipId = f.DadMembershipId }));
        // Dad pressing Mark done again doesn't take over Mom's completion.
        var again = await JsonAsync(await f.Dad.PostAsync($"{Tasks(f)}/{id}/done"));
        var undone = await f.Dad.SendAsync(HttpMethod.Delete, $"{Tasks(f)}/{id}/done");
        var afterUndo = await JsonAsync(undone);
        var history = (await JsonAsync(await f.Mom.GetAsync($"{Tasks(f)}/{id}/history"))).EnumerateArray().ToList();

        Assert.Equal(f.MomMembershipId, done.GetProperty("completedBy").GetGuid());
        Assert.NotEqual(JsonValueKind.Null, done.GetProperty("completedAt").ValueKind);
        Assert.Equal(f.MomMembershipId, again.GetProperty("completedBy").GetGuid());
        Assert.Equal(HttpStatusCode.OK, undone.StatusCode);
        Assert.Equal(JsonValueKind.Null, afterUndo.GetProperty("completedBy").ValueKind);
        Assert.Equal(JsonValueKind.Null, afterUndo.GetProperty("completedAt").ValueKind);
        Assert.Equal(
            [("Created", f.DadMembershipId), ("Done", f.MomMembershipId), ("Undone", f.DadMembershipId)],
            history.Select(h => (h.GetProperty("action").GetString(), h.GetProperty("actorMembershipId").GetGuid())));
    }

    [Fact]
    public async Task History_records_the_actor_and_the_fields_that_changed()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Sign permission slip");

        await f.Mom.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{id}", new { title = "Sign field trip slip", dueDate = Friday, details = "Blue folder", version = await VersionAsync(f.Mom, f, id) });
        var unchanged = await f.Dad.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{id}", new { title = "Sign field trip slip", dueDate = Friday, details = "Blue folder", version = await VersionAsync(f.Dad, f, id) });
        var history = (await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{id}/history"))).EnumerateArray().ToList();

        Assert.Equal(HttpStatusCode.OK, unchanged.StatusCode);
        Assert.Equal(2, history.Count); // Saving without changes adds nothing.
        Assert.Equal("Edited", history[1].GetProperty("action").GetString());
        Assert.Equal(f.MomMembershipId, history[1].GetProperty("actorMembershipId").GetGuid());
        Assert.Equal("title, details", history[1].GetProperty("changes").GetString());
    }

    [Fact]
    public async Task Seen_is_set_only_by_opening_the_details_and_only_for_yourself()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Buy poster board");

        await WeekAsync(f.Mom, f);
        var afterLoading = await JsonAsync(await f.Mom.GetAsync($"{Tasks(f)}/{id}"));
        // Mom tries to mark it seen for Dad: the server only ever uses the signed-in parent.
        var seen = await f.Mom.PostAsync($"{Tasks(f)}/{id}/seen", new { membershipId = f.DadMembershipId });
        var afterOpening = (await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{id}"))).GetProperty("seenBy").EnumerateArray().ToList();

        Assert.Empty(afterLoading.GetProperty("seenBy").EnumerateArray());
        Assert.Equal(HttpStatusCode.NoContent, seen.StatusCode);
        Assert.Equal(f.MomMembershipId, Assert.Single(afterOpening).GetProperty("membershipId").GetGuid());
    }

    [Fact]
    public async Task A_real_edit_clears_the_other_parents_Seen_but_Mark_done_does_not()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Pack gym clothes");
        await f.Dad.PostAsync($"{Tasks(f)}/{id}/seen");
        await f.Mom.PostAsync($"{Tasks(f)}/{id}/seen");

        await f.Mom.PostAsync($"{Tasks(f)}/{id}/done");
        await f.Mom.SendAsync(HttpMethod.Delete, $"{Tasks(f)}/{id}/done");
        var afterDone = await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{id}"));
        await f.Mom.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{id}", new { title = "Pack gym clothes and shoes", dueDate = Friday, version = await VersionAsync(f.Mom, f, id) });
        var afterEdit = (await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{id}"))).GetProperty("seenBy").EnumerateArray().ToList();

        // Owner decision (October 22, 2026): Mark done isn't an edit, so Seen and "edited by" stay.
        Assert.Equal(2, afterDone.GetProperty("seenBy").GetArrayLength());
        Assert.Equal(JsonValueKind.Null, afterDone.GetProperty("editedBy").ValueKind);
        Assert.Equal(f.MomMembershipId, Assert.Single(afterEdit).GetProperty("membershipId").GetGuid());
    }

    [Theory]
    [InlineData("title")]
    [InlineData("long-title")]
    [InlineData("dueDate")]
    [InlineData("details")]
    [InlineData("childId")]
    public async Task Invalid_tasks_are_rejected(string problem)
    {
        var f = await FamilyAsync();
        using var _ = f;
        object body = problem switch
        {
            "title" => new { title = " ", dueDate = Friday },
            "long-title" => new { title = new string('x', 81), dueDate = Friday },
            "dueDate" => new { title = "No date" },
            "details" => new { title = "Too long", dueDate = Friday, details = new string('x', 1001) },
            _ => new { title = "Someone else's child", dueDate = Friday, childId = Guid.NewGuid() },
        };

        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.PostAsync(Tasks(f), body)).StatusCode);
        Assert.Empty(await WeekAsync(f.Dad, f));
    }

    [Fact]
    public async Task Listing_takes_a_date_range_that_ends_after_it_starts()
    {
        var f = await FamilyAsync();
        using var _ = f;
        await CreateAsync(f.Dad, f, "Due Friday");

        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.GetAsync($"{Tasks(f)}?from={Friday}&to={Friday}")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await f.Dad.GetAsync($"{Tasks(f)}?from=2026-10-01&to=2027-01-01")).StatusCode);
        // The end is exclusive: a task due Friday is in [Friday, Saturday) and not in [Thursday, Friday).
        Assert.Single(await RangeAsync(f.Dad, f, Friday, "2026-10-17"));
        Assert.Empty(await RangeAsync(f.Dad, f, "2026-10-15", Friday));
    }

    [Fact]
    public async Task Other_households_cannot_reach_tasks()
    {
        // Child sessions are refused too: see ChildAccessTests (one child sign-in for the whole suite's rate limit).
        var f = await FamilyAsync();
        using var _ = f;
        var id = await CreateAsync(f.Dad, f, "Order school photos");
        using var outsider = await ApiSession.SignedInAsync(api);

        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"{Tasks(f)}/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{id}", new { title = "Mine now", dueDate = Friday, version = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.SendAsync(HttpMethod.Delete, $"{Tasks(f)}/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PostAsync($"{Tasks(f)}/{id}/done")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PostAsync($"{Tasks(f)}/{id}/seen")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"{Tasks(f)}/{id}/history")).StatusCode);
        var task = Assert.Single(await WeekAsync(f.Dad, f));
        Assert.Equal("Order school photos", task.GetProperty("title").GetString());
        Assert.Equal(JsonValueKind.Null, task.GetProperty("completedBy").ValueKind);
    }

    private static async Task<List<JsonElement>> RangeAsync(ApiSession session, Family f, string from, string to) =>
        (await JsonAsync(await session.GetAsync($"{Tasks(f)}?from={from}&to={to}"))).EnumerateArray().ToList();

    private static Task<List<JsonElement>> WeekAsync(ApiSession session, Family f) => RangeAsync(session, f, "2026-10-12", "2026-10-19");

    private static async Task<Guid> CreateAsync(ApiSession parent, Family f, string title) =>
        (await JsonAsync(await parent.PostAsync(Tasks(f), new { title, dueDate = Friday }))).GetProperty("id").GetGuid();

    private static async Task<uint> VersionAsync(ApiSession session, Family f, Guid id) =>
        (await JsonAsync(await session.GetAsync($"{Tasks(f)}/{id}"))).GetProperty("version").GetUInt32();

    private static string Tasks(Family f) => $"/api/families/{f.FamilyId}/calendar/tasks";

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
