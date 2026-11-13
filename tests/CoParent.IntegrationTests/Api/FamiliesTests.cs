using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace CoParent.IntegrationTests.Api;

[Collection(ApiCollectionDefinition.Name)]
public sealed class FamiliesTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Creating_a_family_makes_the_creator_a_parent()
    {
        using var parent = await ApiSession.SignedInAsync(api);

        var response = await parent.PostAsync("/api/families", new { name = "Rivera Family", timeZone = "America/Chicago" });
        var created = await JsonAsync(response);
        var mine = await JsonAsync(await parent.GetAsync("/api/me/families"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal($"/api/families/{created.GetProperty("id").GetGuid()}", response.Headers.Location?.OriginalString);
        Assert.Equal("Parent", created.GetProperty("role").GetString());
        var listed = Assert.Single(mine.EnumerateArray());
        Assert.Equal("Rivera Family", listed.GetProperty("name").GetString());
        Assert.Equal("Parent", listed.GetProperty("role").GetString());
    }

    [Fact]
    public async Task Members_can_read_their_family_with_member_names()
    {
        using var parent = await ApiSession.SignedInAsync(api, displayName: "Jordan Lee");
        var familyId = await parent.CreateFamilyAsync("Lee Family", "Europe/London");

        var family = await JsonAsync(await parent.GetAsync($"/api/families/{familyId}"));

        Assert.Equal("Lee Family", family.GetProperty("name").GetString());
        Assert.Equal("Europe/London", family.GetProperty("timeZone").GetString());
        var member = Assert.Single(family.GetProperty("members").EnumerateArray());
        Assert.Equal("Jordan Lee", member.GetProperty("displayName").GetString());
        Assert.Equal("Parent", member.GetProperty("role").GetString());
        Assert.True(member.GetProperty("isYou").GetBoolean());
    }

    [Fact]
    public async Task An_outsider_gets_the_same_404_as_for_a_family_that_does_not_exist()
    {
        using var parentA = await ApiSession.SignedInAsync(api);
        using var parentB = await ApiSession.SignedInAsync(api);
        var familyA = await parentA.CreateFamilyAsync();

        var foreign = await parentB.GetAsync($"/api/families/{familyA}");
        var missing = await parentB.GetAsync($"/api/families/{Guid.CreateVersion7()}");

        Assert.Equal(HttpStatusCode.NotFound, foreign.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal((await JsonAsync(missing)).GetProperty("title").GetString(), (await JsonAsync(foreign)).GetProperty("title").GetString());
    }

    [Fact]
    public async Task A_users_family_list_only_includes_their_own_families()
    {
        using var parentA = await ApiSession.SignedInAsync(api);
        using var parentB = await ApiSession.SignedInAsync(api);
        await parentA.CreateFamilyAsync("Family A");
        await parentB.CreateFamilyAsync("Family B");

        var listB = await JsonAsync(await parentB.GetAsync("/api/me/families"));

        Assert.Equal(["Family B"], listB.EnumerateArray().Select(f => f.GetProperty("name").GetString()));
    }

    [Theory]
    [InlineData("", "America/Chicago", "name")]
    [InlineData("Rivera Family", "Mars/Olympus_Mons", "timeZone")]
    public async Task Invalid_family_details_are_rejected(string name, string timeZone, string field)
    {
        using var parent = await ApiSession.SignedInAsync(api);

        var response = await parent.PostAsync("/api/families", new { name, timeZone });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True((await JsonAsync(response)).GetProperty("errors").TryGetProperty(field, out _));
    }

    [Fact]
    public async Task Creating_a_family_requires_a_session()
    {
        using var anonymous = await ApiSession.StartAsync(api);

        var response = await anonymous.PostAsync("/api/families", new { name = "Rivera Family" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Family_creation_is_audit_logged_with_the_actor()
    {
        using var parent = await ApiSession.SignedInAsync(api);
        var userId = (await JsonAsync(await parent.GetAsync("/api/me"))).GetProperty("id").GetGuid();

        var familyId = await parent.CreateFamilyAsync();

        var actor = await api.QueryScalarAsync<Guid>(
            "SELECT actor_user_id FROM audit.audit_log WHERE action = 'family.created' AND resource_id = @family",
            ("family", familyId));
        Assert.Equal(userId, actor);
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
