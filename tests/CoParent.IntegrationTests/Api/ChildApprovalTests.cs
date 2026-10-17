using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.IntegrationTests.Api;

/// <summary>Children need both parents' approval, even before the co-parent joins (FM-04, ADR-0006, ADR-0003).</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class ChildApprovalTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task A_child_added_by_one_parent_waits_for_the_other_even_before_they_join()
    {
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync();

        var added = await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" });
        var child = await JsonAsync(added);
        var inbox = await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/approvals"));
        var ownApproval = await dad.PostAsync(
            $"/api/families/{familyId}/approvals/{child.GetProperty("changeRequestId").GetGuid()}/approve");

        Assert.Equal(HttpStatusCode.Created, added.StatusCode);
        Assert.Equal("PendingApproval", child.GetProperty("status").GetString());
        var request = Assert.Single(inbox.EnumerateArray());
        Assert.Equal("ChildCreate", request.GetProperty("type").GetString());
        Assert.Equal("Add Kai to the family", request.GetProperty("summary").GetString());
        Assert.Equal(1, request.GetProperty("approvals").GetInt32());
        Assert.Equal(2, request.GetProperty("requiredApprovals").GetInt32());
        Assert.False(request.GetProperty("canDecide").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, ownApproval.StatusCode);
        Assert.Equal("PendingApproval", (await ChildrenAsync(dad, familyId)).Single().GetProperty("status").GetString());
    }

    [Fact]
    public async Task The_co_parent_joins_and_approves_and_the_child_becomes_active()
    {
        var (dad, mom, familyId) = await TwoParentFamilyAsync(addChildFirst: "Kai");
        using (dad)
        using (mom)
        {
            var request = Assert.Single((await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/approvals"))).EnumerateArray());
            Assert.True(request.GetProperty("canDecide").GetBoolean());

            var approved = await mom.PostAsync($"/api/families/{familyId}/approvals/{request.GetProperty("id").GetGuid()}/approve");

            Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
            Assert.Equal("Approved", (await JsonAsync(approved)).GetProperty("status").GetString());
            var kai = Assert.Single(await ChildrenAsync(dad, familyId));
            Assert.Equal("Active", kai.GetProperty("status").GetString());
            Assert.Empty((await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/approvals"))).EnumerateArray());
        }
    }

    [Fact]
    public async Task A_rejected_child_is_never_created()
    {
        var (dad, mom, familyId) = await TwoParentFamilyAsync(addChildFirst: "Kai");
        using (dad)
        using (mom)
        {
            var request = Assert.Single((await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/approvals"))).EnumerateArray());
            var id = request.GetProperty("id").GetGuid();

            var rejected = await mom.PostAsync($"/api/families/{familyId}/approvals/{id}/reject");
            var again = await mom.PostAsync($"/api/families/{familyId}/approvals/{id}/approve");

            Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
            Assert.Equal("Rejected", (await JsonAsync(rejected)).GetProperty("status").GetString());
            Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
            Assert.Empty(await ChildrenAsync(dad, familyId));
        }
    }

    [Fact]
    public async Task A_decision_can_carry_a_comment_and_decided_requests_move_to_history()
    {
        var (dad, mom, familyId) = await TwoParentFamilyAsync(addChildFirst: "Kai");
        using (dad)
        using (mom)
        {
            var request = Assert.Single((await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/approvals"))).EnumerateArray());

            var rejected = await mom.PostAsync(
                $"/api/families/{familyId}/approvals/{request.GetProperty("id").GetGuid()}/reject", new { comment = "Let's add Kai together this weekend." });
            var pending = await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/approvals"));
            var history = await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/approvals?view=history"));

            Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);
            Assert.Empty(pending.EnumerateArray());
            var decided = Assert.Single(history.EnumerateArray());
            Assert.Equal("Rejected", decided.GetProperty("status").GetString());
            Assert.NotEqual(JsonValueKind.Null, decided.GetProperty("resolvedAt").ValueKind);
            var decision = Assert.Single(decided.GetProperty("decisions").EnumerateArray());
            Assert.Equal("Reject", decision.GetProperty("decision").GetString());
            Assert.Equal("Let's add Kai together this weekend.", decision.GetProperty("comment").GetString());
        }
    }

    [Fact]
    public async Task A_comment_that_is_too_long_is_rejected()
    {
        var (dad, mom, familyId) = await TwoParentFamilyAsync(addChildFirst: "Kai");
        using (dad)
        using (mom)
        {
            var request = Assert.Single((await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/approvals"))).EnumerateArray());

            var response = await mom.PostAsync(
                $"/api/families/{familyId}/approvals/{request.GetProperty("id").GetGuid()}/approve", new { comment = new string('x', 501) });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
    }

    [Fact]
    public async Task An_unanswered_request_expires_after_two_weeks_and_counts_as_not_approved()
    {
        var (dad, mom, familyId) = await TwoParentFamilyAsync(addChildFirst: "Kai");
        using (dad)
        using (mom)
        {
            var expiry = api.Services.GetRequiredService<CoParent.Modules.Approvals.Contracts.IRequestExpiry>();

            var tooSoon = await expiry.ExpireAsync(DateTimeOffset.UtcNow.AddDays(13), TestContext.Current.CancellationToken);
            var expired = await expiry.ExpireAsync(DateTimeOffset.UtcNow.AddDays(15), TestContext.Current.CancellationToken);
            var history = await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/approvals?view=history"));

            Assert.Equal(0, tooSoon);
            Assert.Equal(1, expired);
            Assert.Empty(await ChildrenAsync(dad, familyId));
            Assert.Equal("Expired", Assert.Single(history.EnumerateArray()).GetProperty("status").GetString());
        }
    }

    [Fact]
    public async Task The_proposer_can_withdraw_and_only_the_proposer()
    {
        var (dad, mom, familyId) = await TwoParentFamilyAsync(addChildFirst: "Kai");
        using (dad)
        using (mom)
        {
            var request = Assert.Single((await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/approvals"))).EnumerateArray());
            var id = request.GetProperty("id").GetGuid();

            var byMom = await mom.PostAsync($"/api/families/{familyId}/approvals/{id}/withdraw");
            var byDad = await dad.PostAsync($"/api/families/{familyId}/approvals/{id}/withdraw");

            Assert.Equal(HttpStatusCode.NotFound, byMom.StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, byDad.StatusCode);
            Assert.Empty(await ChildrenAsync(mom, familyId));
        }
    }

    [Fact]
    public async Task Household_setup_adds_each_child_as_its_own_request()
    {
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();

        foreach (var name in new[] { "Kai", "Aurora" })
        {
            Assert.Equal(HttpStatusCode.Created, (await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = name })).StatusCode);
        }

        Assert.Equal(
            ["Add Kai to the family", "Add Aurora to the family"],
            (await JsonAsync(await dad.GetAsync($"/api/families/{familyId}/approvals"))).EnumerateArray().Select(r => r.GetProperty("summary").GetString()));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("A name that is far too long to be anyone's first name at all")]
    public async Task Invalid_names_are_rejected(string firstName)
    {
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();

        var response = await dad.PostAsync($"/api/families/{familyId}/children", new { firstName });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Outsiders_cannot_see_a_familys_children_or_approvals()
    {
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();
        await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" });
        using var outsider = await ApiSession.SignedInAsync(api);

        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/families/{familyId}/children")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"/api/families/{familyId}/approvals")).StatusCode);
    }

    private async Task<(ApiSession Dad, ApiSession Mom, Guid FamilyId)> TwoParentFamilyAsync(string addChildFirst)
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync();
        await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = addChildFirst });
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        return (dad, mom, familyId);
    }

    private static async Task<List<JsonElement>> ChildrenAsync(ApiSession session, Guid familyId) =>
        (await JsonAsync(await session.GetAsync($"/api/families/{familyId}/children"))).EnumerateArray().ToList();

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
