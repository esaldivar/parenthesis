using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

[Collection(ApiCollectionDefinition.Name)]
public sealed class SharedFundTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task A_fund_opens_only_after_the_other_parent_approves()
    {
        using var proposer = await ApiSession.SignedInAsync(api);
        var familyId = await proposer.CreateFamilyAsync();
        var email = ApiSession.NewEmail();
        var root = $"/api/families/{familyId}";
        var path = $"{root}/shared-funds";
        var proposal = new { title = "School supplies", currency = "USD", proposerShareMinor = 18000, coParentShareMinor = 12000 };
        Assert.Equal(HttpStatusCode.Conflict, (await proposer.PostAsync(path, proposal)).StatusCode);

        Assert.Equal(HttpStatusCode.Accepted, (await proposer.PostAsync($"{root}/invitations", new { email })).StatusCode);
        var token = QueryHelpers.ParseQuery(proposer.Emails.LatestLink(email, "invited").Query)["token"].ToString();
        using var coParent = await ApiSession.SignedInAsync(api, email: email);
        Assert.Equal(HttpStatusCode.OK, (await coParent.PostAsync("/api/invitations/accept", new { token })).StatusCode);

        var child = await JsonAsync(await proposer.PostAsync($"{root}/children", new { firstName = "Kai" }));
        var childId = child.GetProperty("id").GetGuid();
        var childApproval = child.GetProperty("changeRequestId").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await coParent.PostAsync($"{root}/approvals/{childApproval}/approve")).StatusCode);
        var response = await proposer.PostAsync(path, new
        {
            proposal.title,
            proposal.currency,
            proposal.proposerShareMinor,
            proposal.coParentShareMinor,
            childIds = new[] { childId },
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var record = await JsonAsync(response);
        Assert.Equal("AwaitingAgreement", record.GetProperty("status").GetString());
        var approvalPath = $"{root}/approvals/{record.GetProperty("approvalId").GetGuid()}/approve";
        Assert.Equal(HttpStatusCode.Conflict, (await proposer.PostAsync(approvalPath)).StatusCode);

        using var outsider = await ApiSession.SignedInAsync(api);
        await outsider.CreateFamilyAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.PostAsync(approvalPath)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await coParent.PostAsync(approvalPath)).StatusCode);

        await proposer.SendAsync(HttpMethod.Put, $"{root}/children/{childId}/pin", new { pin = "2580" });
        var pairing = await JsonAsync(await proposer.PostAsync($"{root}/children/{childId}/pairing-code"));
        using var tablet = await ApiSession.StartAsync(api);
        await tablet.PostAsync("/api/device/pair", new { code = pairing.GetProperty("code").GetString(), deviceName = "Test tablet" });
        await tablet.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.NoContent, (await tablet.PostAsync("/api/device/child-session", new { childId, pin = "2580" })).StatusCode);
        await tablet.RefreshAntiforgeryAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await tablet.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await tablet.PostAsync(path, proposal)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await tablet.GetAsync($"{root}/approvals")).StatusCode);
        foreach (var parent in new[] { proposer, coParent })
        {
            var list = await parent.GetAsync(path);
            Assert.True(list.Headers.CacheControl?.NoStore);
            var fund = Assert.Single((await JsonAsync(list)).EnumerateArray());
            Assert.Equal("Open", fund.GetProperty("status").GetString());
            Assert.Equal(18000, fund.GetProperty("proposerShareMinor").GetInt64());
            Assert.Equal(12000, fund.GetProperty("coParentShareMinor").GetInt64());
        }
    }

    [Fact]
    public async Task A_fund_stays_when_one_parent_leaves_and_goes_when_the_family_closes()
    {
        using var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();
        var root = $"/api/families/{familyId}";
        var email = ApiSession.NewEmail();
        await dad.PostAsync($"{root}/invitations", new { email });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(email, "invited").Query)["token"].ToString();
        using var mom = await ApiSession.SignedInAsync(api, email: email);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        var proposal = new { title = "Braces", currency = "USD", proposerShareMinor = 5000, coParentShareMinor = 5000 };
        var record = await JsonAsync(await dad.PostAsync($"{root}/shared-funds", proposal));
        Assert.Equal(HttpStatusCode.OK,
            (await mom.PostAsync($"{root}/approvals/{record.GetProperty("approvalId").GetGuid()}/approve")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);
        Assert.Equal(1L, await FundCountAsync(familyId));

        Assert.Equal(HttpStatusCode.NoContent, (await mom.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);
        Assert.Equal(0L, await FundCountAsync(familyId));
    }

    private Task<long> FundCountAsync(Guid familyId) =>
        api.QueryScalarAsync<long>("select count(*) from shared_records.funds where family_id = @v", ("v", familyId));

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
