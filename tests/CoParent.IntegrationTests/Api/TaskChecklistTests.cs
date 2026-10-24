using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Task checklists and automatic completion (#73, part 2: #175). Synthetic family only: Dad and Mom.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class TaskChecklistTests(ApiFactory api) : IAsyncLifetime
{
    private const string Friday = "2026-10-16";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Ticking_the_last_required_item_completes_the_task_once_with_quiet_attribution()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var task = await CreateAsync(f.Dad, f, ("Poster board", true), ("Glue sticks", true), ("Extra markers", false));
        var (board, glue, markers) = (ItemId(task, 0), ItemId(task, 1), ItemId(task, 2));

        var first = await TickAsync(f.Mom, f, task, board);
        var optional = await TickAsync(f.Dad, f, task, markers);
        var last = await TickAsync(f.Dad, f, task, glue);
        var again = await TickAsync(f.Mom, f, task, glue);
        var reloaded = await JsonAsync(await f.Mom.GetAsync($"{Tasks(f)}/{Id(task)}"));
        var history = (await JsonAsync(await f.Mom.GetAsync($"{Tasks(f)}/{Id(task)}/history"))).EnumerateArray()
            .Select(h => (h.GetProperty("action").GetString(), h.GetProperty("actorMembershipId").GetGuid())).ToList();

        Assert.Equal((0, 2), Progress(task));
        Assert.Equal((1, 2), Progress(first));
        Assert.Equal(f.MomMembershipId, Item(first, 0).GetProperty("completedBy").GetGuid());
        Assert.False(first.GetProperty("justCompleted").GetBoolean());
        Assert.Equal((1, 2), Progress(optional)); // Optional items don't count when some are required.
        Assert.Equal(JsonValueKind.Null, optional.GetProperty("completedBy").ValueKind);
        Assert.Equal((2, 2), Progress(last));
        Assert.True(last.GetProperty("justCompleted").GetBoolean()); // The celebration plays on this change only.
        Assert.Equal(f.DadMembershipId, last.GetProperty("completedBy").GetGuid());
        Assert.False(again.GetProperty("justCompleted").GetBoolean());
        Assert.Equal(f.DadMembershipId, Item(again, 1).GetProperty("completedBy").GetGuid()); // Mom can't take Dad's tick.
        // Everything survives a reload.
        Assert.Equal(f.DadMembershipId, reloaded.GetProperty("completedBy").GetGuid());
        Assert.False(reloaded.GetProperty("justCompleted").GetBoolean());
        Assert.Equal([f.MomMembershipId, f.DadMembershipId, f.DadMembershipId],
            reloaded.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("completedBy").GetGuid()));
        Assert.Equal(
            [("Created", f.DadMembershipId), ("ItemDone", f.MomMembershipId), ("ItemDone", f.DadMembershipId),
             ("ItemDone", f.DadMembershipId), ("Done", f.DadMembershipId)],
            history);
    }

    [Fact]
    public async Task Unticking_a_required_item_reopens_the_task_and_ticking_it_again_completes_it_again()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var task = await CreateAsync(f.Dad, f, ("Pack lunch", true), ("Pack snack", true));
        await TickAsync(f.Dad, f, task, ItemId(task, 0));
        await TickAsync(f.Dad, f, task, ItemId(task, 1));

        // Either parent can untick, even the other parent's tick (owner decision, October 21, 2026).
        var untick = await f.Mom.SendAsync(HttpMethod.Delete, $"{Tasks(f)}/{Id(task)}/items/{ItemId(task, 1)}/done");
        var reopened = await JsonAsync(untick);
        var completedAgain = await TickAsync(f.Mom, f, task, ItemId(task, 1));
        var history = (await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{Id(task)}/history"))).EnumerateArray()
            .Select(h => (h.GetProperty("action").GetString(), h.GetProperty("actorMembershipId").GetGuid())).ToList();

        Assert.Equal(HttpStatusCode.OK, untick.StatusCode);
        Assert.Equal(JsonValueKind.Null, reopened.GetProperty("completedAt").ValueKind);
        Assert.Equal((1, 2), Progress(reopened));
        Assert.True(completedAgain.GetProperty("justCompleted").GetBoolean());
        Assert.Equal(f.MomMembershipId, completedAgain.GetProperty("completedBy").GetGuid());
        Assert.Equal(
            [("ItemUndone", f.MomMembershipId), ("Undone", f.MomMembershipId), ("ItemDone", f.MomMembershipId), ("Done", f.MomMembershipId)],
            history.Skip(4));
    }

    [Fact]
    public async Task With_no_required_items_every_item_decides_and_Mark_done_is_not_offered()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var task = await CreateAsync(f.Dad, f, ("Wash the jersey", false), ("Find the shin guards", false));

        var markDone = await f.Dad.PostAsync($"{Tasks(f)}/{Id(task)}/done");
        var one = await TickAsync(f.Dad, f, task, ItemId(task, 0));
        var both = await TickAsync(f.Mom, f, task, ItemId(task, 1));

        Assert.Equal(HttpStatusCode.Conflict, markDone.StatusCode);
        Assert.Equal((1, 2), Progress(one));
        Assert.Equal(JsonValueKind.Null, one.GetProperty("completedAt").ValueKind);
        Assert.True(both.GetProperty("justCompleted").GetBoolean());
        Assert.Equal((2, 2), Progress(both));
    }

    [Fact]
    public async Task An_edit_from_an_old_copy_is_refused_so_neither_parents_change_is_lost()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var task = await CreateAsync(f.Dad, f, ("Return library books", true));
        var dadsCopy = Version(task);

        // Mom ticks the item; Dad then saves an edit made from the copy he loaded before her tick.
        await TickAsync(f.Mom, f, task, ItemId(task, 0));
        var staleEdit = await f.Dad.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{Id(task)}", new
        {
            title = "Return library books and DVDs",
            dueDate = Friday,
            items = new[] { new { id = ItemId(task, 0), text = "Return library books", required = true } },
            version = dadsCopy,
        });
        var problem = await JsonAsync(staleEdit);
        var current = await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{Id(task)}"));
        var retry = await f.Dad.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{Id(task)}", new
        {
            title = "Return library books and DVDs",
            dueDate = Friday,
            items = new[] { new { id = ItemId(task, 0), text = "Return library books", required = true } },
            version = Version(current),
        });
        var saved = await JsonAsync(retry);
        var noVersion = await f.Dad.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{Id(task)}", new { title = "No version", dueDate = Friday });

        Assert.Equal(HttpStatusCode.Conflict, staleEdit.StatusCode);
        Assert.Equal("The other parent just changed this task.", problem.GetProperty("title").GetString());
        Assert.Equal("Science fair", current.GetProperty("title").GetString()); // Dad's stale edit changed nothing.
        Assert.Equal(f.MomMembershipId, Item(current, 0).GetProperty("completedBy").GetGuid());
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        // Dad's edit kept Mom's tick and the completion it caused.
        Assert.Equal(f.MomMembershipId, Item(saved, 0).GetProperty("completedBy").GetGuid());
        Assert.Equal(f.MomMembershipId, saved.GetProperty("completedBy").GetGuid());
        Assert.NotEqual(Version(current), Version(saved));
        Assert.Equal(HttpStatusCode.BadRequest, noVersion.StatusCode);
    }

    [Fact]
    public async Task Both_parents_ticking_at_the_same_moment_never_leaves_a_wrong_completion()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var task = await CreateAsync(f.Dad, f, ("Sign the form", true), ("Pay the fee", true));

        var responses = await Task.WhenAll(
            f.Dad.PostAsync($"{Tasks(f)}/{Id(task)}/items/{ItemId(task, 0)}/done"),
            f.Mom.PostAsync($"{Tasks(f)}/{Id(task)}/items/{ItemId(task, 1)}/done"));
        var after = await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{Id(task)}"));
        var ticked = after.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("completedAt").ValueKind != JsonValueKind.Null).ToList();

        // Each tick either saved or got a clear conflict to refresh from; nothing in between.
        Assert.All(responses, r => Assert.Contains(r.StatusCode, new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }));
        Assert.Equal(responses.Select(r => r.StatusCode == HttpStatusCode.OK), ticked);
        Assert.Equal(ticked.All(t => t), after.GetProperty("completedAt").ValueKind != JsonValueKind.Null);
    }

    [Fact]
    public async Task Editing_the_checklist_recalculates_completion_and_is_an_edit()
    {
        var f = await FamilyAsync();
        using var _ = f;
        var task = await CreateAsync(f.Dad, f, ("Buy cleats", true), ("Buy socks", true));
        task = await TickAsync(f.Dad, f, task, ItemId(task, 0));
        await f.Dad.PostAsync($"{Tasks(f)}/{Id(task)}/seen");

        // Mom removes the unticked required item: the task completes.
        var removed = await JsonAsync(await f.Mom.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{Id(task)}", new
        {
            title = "Soccer gear",
            dueDate = Friday,
            items = new[] { new { id = (Guid?)ItemId(task, 0), text = "Buy cleats", required = true } },
            version = Version(task),
        }));
        // Then adds a required item: it reopens. New items come without an id.
        var added = await JsonAsync(await f.Mom.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{Id(task)}", new
        {
            title = "Soccer gear",
            dueDate = Friday,
            items = new[]
            {
                new { id = (Guid?)ItemId(task, 0), text = "Buy cleats", required = true },
                new { id = (Guid?)null, text = "Buy shin guards", required = true },
            },
            version = Version(removed),
        }));
        var dadView = await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{Id(task)}"));
        var history = (await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{Id(task)}/history"))).EnumerateArray().ToList();

        Assert.True(removed.GetProperty("justCompleted").GetBoolean());
        Assert.Equal((1, 1), Progress(removed));
        Assert.Equal(JsonValueKind.Null, added.GetProperty("completedAt").ValueKind);
        Assert.Equal((1, 2), Progress(added));
        Assert.Equal(["Buy cleats", "Buy shin guards"], added.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("text").GetString()));
        Assert.Equal(f.DadMembershipId, Item(added, 0).GetProperty("completedBy").GetGuid()); // The kept item keeps its tick.
        Assert.Equal(f.MomMembershipId, dadView.GetProperty("editedBy").GetGuid());
        Assert.Empty(dadView.GetProperty("seenBy").EnumerateArray()); // A real edit clears the other parent's Seen.
        Assert.Contains(history, h => h.GetProperty("action").GetString() == "Edited" && h.GetProperty("changes").GetString() == "title, checklist");
    }

    [Theory]
    [InlineData("empty-text")]
    [InlineData("long-text")]
    [InlineData("too-many")]
    public async Task Invalid_checklists_are_rejected(string problem)
    {
        var f = await FamilyAsync();
        using var _ = f;
        var items = problem switch
        {
            "empty-text" => new[] { new { text = " ", required = true } },
            "long-text" => new[] { new { text = new string('x', 121), required = true } },
            _ => Enumerable.Range(0, 51).Select(i => new { text = $"Item {i}", required = false }).ToArray(),
        };

        var response = await f.Dad.PostAsync(Tasks(f), new { title = "Checklist", dueDate = Friday, items });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Items_are_reachable_only_through_their_own_task_and_household()
    {
        // Child sessions are refused too: see ChildAccessTests (one child sign-in for the whole suite's rate limit).
        var f = await FamilyAsync();
        using var _ = f;
        var task = await CreateAsync(f.Dad, f, ("Order photos", true));
        var other = await CreateAsync(f.Dad, f, ("Pay for photos", true));
        using var outsider = await ApiSession.SignedInAsync(api);

        var outsiderTick = await outsider.PostAsync($"{Tasks(f)}/{Id(task)}/items/{ItemId(task, 0)}/done");
        var wrongTask = await f.Mom.PostAsync($"{Tasks(f)}/{Id(task)}/items/{ItemId(other, 0)}/done");
        // An edit can't pull another task's item into this one.
        var forged = await f.Mom.SendAsync(HttpMethod.Put, $"{Tasks(f)}/{Id(task)}", new
        {
            title = "Order photos",
            dueDate = Friday,
            items = new[] { new { id = ItemId(other, 0), text = "Pay for photos", required = true } },
            version = Version(task),
        });
        var after = await JsonAsync(await f.Dad.GetAsync($"{Tasks(f)}/{Id(other)}"));

        Assert.Equal(HttpStatusCode.NotFound, outsiderTick.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, wrongTask.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, forged.StatusCode);
        Assert.Equal(JsonValueKind.Null, Item(after, 0).GetProperty("completedAt").ValueKind);
    }

    private static Guid Id(JsonElement task) => task.GetProperty("id").GetGuid();

    private static uint Version(JsonElement task) => task.GetProperty("version").GetUInt32();

    private static JsonElement Item(JsonElement task, int index) => task.GetProperty("items")[index];

    private static Guid ItemId(JsonElement task, int index) => Item(task, index).GetProperty("id").GetGuid();

    private static (int, int) Progress(JsonElement task) =>
        (task.GetProperty("progressDone").GetInt32(), task.GetProperty("progressTotal").GetInt32());

    private static async Task<JsonElement> TickAsync(ApiSession session, Family f, JsonElement task, Guid itemId) =>
        await JsonAsync(await session.PostAsync($"{Tasks(f)}/{Id(task)}/items/{itemId}/done"));

    private static async Task<JsonElement> CreateAsync(ApiSession parent, Family f, params (string Text, bool Required)[] items)
    {
        var response = await parent.PostAsync(Tasks(f), new
        {
            title = "Science fair",
            dueDate = Friday,
            items = items.Select(i => new { text = i.Text, required = i.Required }).ToArray(),
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await JsonAsync(response);
    }

    private static string Tasks(Family f) => $"/api/families/{f.FamilyId}/calendar/tasks";

    /// <summary>Dad and Mom.</summary>
    private async Task<Family> FamilyAsync()
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync("Rivera Family");
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        await mom.PostAsync("/api/invitations/accept", new { token });

        var members = (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}"))).GetProperty("members").EnumerateArray().ToList();
        Guid Membership(string name) => members.Single(m => m.GetProperty("displayName").GetString() == name).GetProperty("membershipId").GetGuid();
        return new Family(dad, mom, familyId, Membership("Dad"), Membership("Mom"));
    }

    private sealed record Family(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid DadMembershipId, Guid MomMembershipId) : IDisposable
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
