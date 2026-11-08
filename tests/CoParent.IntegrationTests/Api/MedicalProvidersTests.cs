using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

[Collection(ApiCollectionDefinition.Name)]
public sealed class MedicalProvidersTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Batch_add_is_atomic_family_scoped_and_safe_to_retry()
    {
        using var parent = await ApiSession.SignedInAsync(api);
        var family = await parent.CreateFamilyAsync();
        var first = await ProposeChildAsync(parent, family, "Sam");
        var second = await ProposeChildAsync(parent, family, "Jo");
        var email = ApiSession.NewEmail();
        await parent.PostAsync($"/api/families/{family}/invitations", new { email });
        var token = QueryHelpers.ParseQuery(parent.Emails.LatestLink(email, "invited").Query)["token"].ToString();
        using var coParent = await ApiSession.SignedInAsync(api, email: email);
        using var accepted = await coParent.PostAsync("/api/invitations/accept", new { token });
        accepted.EnsureSuccessStatusCode();
        foreach (var request in new[] { first.RequestId, second.RequestId })
        {
            using var approved = await coParent.PostAsync($"/api/families/{family}/approvals/{request}/approve");
            approved.EnsureSuccessStatusCode();
        }

        var path = $"/api/families/{family}/children/{first.ChildId}/essentials/medical";
        var targets = new[] { first.ChildId, second.ChildId };
        var provider = new
        {
            id = Guid.NewGuid(),
            type = "Doctor",
            name = "Dr. Reed",
            phone = "512-555-0142",
            address = "120 Example Lane",
        };

        using var missingPhone = await parent.PostAsync(path,
            new { provider = provider with { phone = "" }, childIds = targets });
        Assert.Equal(HttpStatusCode.BadRequest, missingPhone.StatusCode);
        using var missingAddress = await parent.PostAsync(path,
            new { provider = provider with { address = "" }, childIds = targets });
        Assert.Equal(HttpStatusCode.BadRequest, missingAddress.StatusCode);

        using var outsider = await ApiSession.SignedInAsync(api);
        var otherFamily = await outsider.CreateFamilyAsync();
        var foreign = await ProposeChildAsync(outsider, otherFamily, "Alex");
        using var crossFamily = await parent.PostAsync(path,
            new { provider, childIds = new[] { first.ChildId, foreign.ChildId } });
        Assert.Equal(HttpStatusCode.NotFound, crossFamily.StatusCode);
        using var empty = await coParent.GetAsync(path);
        Assert.Empty((await JsonAsync(empty)).GetProperty("providers").EnumerateArray());

        var body = new { provider, childIds = targets };
        using var saved = await parent.PostAsync(path, body);
        saved.EnsureSuccessStatusCode();
        using var retried = await parent.PostAsync(path, body);
        retried.EnsureSuccessStatusCode();
        Assert.Equal(1, (await JsonAsync(retried)).GetProperty("revision").GetInt32());

        var siblingPath = $"/api/families/{family}/children/{second.ChildId}/essentials/medical";
        using var sibling = await coParent.GetAsync(siblingPath);
        var contact = Assert.Single((await JsonAsync(sibling)).GetProperty("providers").EnumerateArray());
        Assert.Equal(provider.address, contact.GetProperty("address").GetString());
        using var history = await coParent.GetAsync(siblingPath + "/history");
        Assert.Single((await JsonAsync(history)).GetProperty("entries").EnumerateArray());
        using var denied = await outsider.GetAsync(path);
        Assert.Equal(HttpStatusCode.NotFound, denied.StatusCode);
    }

    private static async Task<(Guid ChildId, Guid RequestId)> ProposeChildAsync(
        ApiSession parent, Guid family, string firstName)
    {
        using var response = await parent.PostAsync($"/api/families/{family}/children", new { firstName });
        var child = await JsonAsync(response);
        return (child.GetProperty("id").GetGuid(), child.GetProperty("changeRequestId").GetGuid());
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
    }
}
