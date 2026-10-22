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
