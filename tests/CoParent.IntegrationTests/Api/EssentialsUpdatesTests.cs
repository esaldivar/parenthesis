using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>In-page indicators for shared Child Essentials updates (#128). Synthetic family only.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class EssentialsUpdatesTests(ApiFactory api) : IAsyncLifetime
{
    private static readonly string[] _shoeRow = ["shoeSize"];
    private static readonly string[] _topRow = ["topSize"];

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync()
    {
        api.Clock.Reset();
        return ValueTask.CompletedTask;
    }

    [Fact]
    public async Task A_save_gives_only_the_other_parent_one_notice_and_no_op_or_rejected_saves_give_none()
    {
        var (dad, mom, familyId, kaiId) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        var clothing = $"/api/families/{familyId}/children/{kaiId}/essentials/clothing";

        var saved = await mom.SendAsync(HttpMethod.Put, clothing, new { revision = 0, values = new { shoeSize = "Size 3" } });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        // A retry of the same save conflicts, the same values again change nothing, and an invalid save is refused.
        Assert.Equal(HttpStatusCode.Conflict,
            (await mom.SendAsync(HttpMethod.Put, clothing, new { revision = 0, values = new { shoeSize = "Size 3" } })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await mom.SendAsync(HttpMethod.Put, clothing, new { revision = 1, values = new { shoeSize = " Size 3 " } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await mom.SendAsync(HttpMethod.Put, clothing, new { revision = 1, values = new { shoeSize = new string('x', 65) } })).StatusCode);

        var dads = await UpdatesAsync(dad, familyId);
        Assert.True(dads.GetProperty("newUpdates").GetBoolean());
        var section = Assert.Single(dads.GetProperty("sections").EnumerateArray());
        Assert.Equal(kaiId, section.GetProperty("childId").GetGuid());
        Assert.Equal("clothing", section.GetProperty("section").GetString());
        Assert.True(section.GetProperty("unopened").GetBoolean());
        Assert.Equal(["shoeSize"], Strings(section.GetProperty("rows")));
        Assert.Equal(1L, await NoticeCountAsync(familyId));

        // The author gets nothing for their own save.
        var moms = await UpdatesAsync(mom, familyId);
        Assert.False(moms.GetProperty("newUpdates").GetBoolean());
        Assert.Empty(moms.GetProperty("sections").EnumerateArray());

        // Notices name fields, never values.
        Assert.DoesNotContain("Size 3", dads.GetRawText(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Navigation_banner_section_and_row_indicators_clear_independently_and_history_stays()
    {
        var (dad, mom, familyId, kaiId) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        var clothing = $"/api/families/{familyId}/children/{kaiId}/essentials/clothing";
        await mom.SendAsync(HttpMethod.Put, clothing, new { revision = 0, values = new { shoeSize = "Size 3" } });
        await mom.SendAsync(HttpMethod.Put, clothing, new { revision = 1, values = new { shoeSize = "Size 3", topSize = "Youth M" } });
        var school = $"/api/families/{familyId}/children/{kaiId}/essentials/school";
        await mom.SendAsync(HttpMethod.Put, school, new { revision = 0, values = new { grade = "2", homeroomTeacher = "Ms. Lee" } });

        // Opening the page: one banner per child and section, naming every changed field; only once.
        var banners = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/essentials/updates/opened"));
        Assert.Equal(2, banners.GetArrayLength());
        Assert.Equal("clothing", banners[0].GetProperty("section").GetString());
        Assert.Equal(["shoeSize", "topSize"], Strings(banners[0].GetProperty("fields")));
        Assert.Equal("school", banners[1].GetProperty("section").GetString());
        Assert.Equal(["grade", "homeroomTeacher"], Strings(banners[1].GetProperty("fields")));
        Assert.Equal(0, (await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/essentials/updates/opened"))).GetArrayLength());

        // The navigation dot is gone; every section dot and row highlight stays.
        var afterOpen = await UpdatesAsync(dad, familyId);
        Assert.False(afterOpen.GetProperty("newUpdates").GetBoolean());
        Assert.Equal(2, afterOpen.GetProperty("sections").GetArrayLength());

        // Opening Clothing clears its dot only; its rows stay highlighted until seen.
        Assert.Equal(HttpStatusCode.NoContent,
            (await dad.PostAsync($"/api/families/{familyId}/essentials/updates/sections", new { childId = kaiId, section = "clothing" })).StatusCode);
        var sections = (await UpdatesAsync(dad, familyId)).GetProperty("sections");
        var clothingNotice = sections.EnumerateArray().Single(s => s.GetProperty("section").GetString() == "clothing");
        Assert.False(clothingNotice.GetProperty("unopened").GetBoolean());
        Assert.Equal(["shoeSize", "topSize"], Strings(clothingNotice.GetProperty("rows")));
        Assert.True(sections.EnumerateArray().Single(s => s.GetProperty("section").GetString() == "school").GetProperty("unopened").GetBoolean());

        // Seeing the Shoes row clears that row alone; seeing Tops clears the section.
        Assert.Equal(HttpStatusCode.NoContent,
            (await dad.PostAsync($"/api/families/{familyId}/essentials/updates/rows", new { childId = kaiId, section = "clothing", fields = _shoeRow })).StatusCode);
        clothingNotice = (await UpdatesAsync(dad, familyId)).GetProperty("sections").EnumerateArray()
            .Single(s => s.GetProperty("section").GetString() == "clothing");
        Assert.Equal(["topSize"], Strings(clothingNotice.GetProperty("rows")));
        await dad.PostAsync($"/api/families/{familyId}/essentials/updates/rows", new { childId = kaiId, section = "clothing", fields = _topRow });
        Assert.DoesNotContain((await UpdatesAsync(dad, familyId)).GetProperty("sections").EnumerateArray(),
            s => s.GetProperty("section").GetString() == "clothing");

        // History doesn't depend on any of it.
        var history = await JsonAsync(await dad.GetAsync(clothing + "/history"));
        Assert.Equal(2, history.GetProperty("entries").GetArrayLength());

        // A later save shows a new navigation dot and banner.
        await mom.SendAsync(HttpMethod.Put, clothing, new { revision = 2, values = new { shoeSize = "Size 4", topSize = "Youth M" } });
        Assert.True((await UpdatesAsync(dad, familyId)).GetProperty("newUpdates").GetBoolean());
        var later = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/essentials/updates/opened"));
        Assert.Equal(["shoeSize"], Strings(Assert.Single(later.EnumerateArray()).GetProperty("fields")));
    }

    [Fact]
    public async Task Every_shared_section_records_its_changed_fields()
    {
        var (dad, mom, familyId, kaiId) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        var child = $"/api/families/{familyId}/children/{kaiId}/essentials";
        await dad.SendAsync(HttpMethod.Put, $"{child}/what-helps", new { revision = 0, values = new { comfortItems = "Blue bunny" } });
        await dad.SendAsync(HttpMethod.Put, $"{child}/allergies-food", new { revision = 0, values = new { noKnownAllergies = true } });

        var banners = await JsonAsync(await mom.PostAsync($"/api/families/{familyId}/essentials/updates/opened"));
        Assert.Equal(["whatHelps", "allergiesFood"], banners.EnumerateArray().Select(b => b.GetProperty("section").GetString()!).ToList());
        Assert.Equal(["comfortItems"], Strings(banners[0].GetProperty("fields")));
        Assert.Equal(["noKnownAllergies"], Strings(banners[1].GetProperty("fields")));
    }

    [Fact]
    public async Task Routines_record_shared_changes_and_the_co_parents_own_routine_but_not_accepting_or_stopping()
    {
        var (dad, mom, familyId, kaiId) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        var routines = $"/api/families/{familyId}/children/{kaiId}/essentials/routines";
        var shared = new { id = Guid.NewGuid(), title = "Brushing teeth", details = "After breakfast" };
        Assert.Equal(HttpStatusCode.OK, (await mom.SendAsync(HttpMethod.Put, routines,
            new { revision = 0, values = new { entries = new[] { shared } } })).StatusCode);

        var homes = await JsonAsync(await mom.GetAsync(routines + "/households"));
        var momsId = homes.EnumerateArray().Single(h => h.GetProperty("isMine").GetBoolean()).GetProperty("ownerId").GetGuid();
        var lightsOut = new { id = Guid.NewGuid(), title = "Lights out", details = "8:30 PM" };
        var nap = new { id = Guid.NewGuid(), title = "Nap", details = (string?)null };
        Assert.Equal(HttpStatusCode.OK, (await mom.SendAsync(HttpMethod.Put, $"{routines}/households/{momsId}",
            new { revision = 0, action = "save", values = new { entries = new object[] { lightsOut, nap } } })).StatusCode);
        // Dad accepting Mom's routine into Shared changes no text, so Mom gets no notice for it.
        Assert.Equal(HttpStatusCode.OK, (await dad.SendAsync(HttpMethod.Put, $"{routines}/households/{momsId}",
            new { revision = 1, action = "accept" })).StatusCode);

        // Notices name changed routines by id only, never by their text.
        var banners = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/essentials/updates/opened"));
        Assert.Equal(["routines", "householdRoutines"], banners.EnumerateArray().Select(b => b.GetProperty("section").GetString()!).ToList());
        Assert.Equal([shared.id.ToString()], Strings(banners[0].GetProperty("fields")));
        Assert.Equal([lightsOut.id.ToString(), nap.id.ToString()], Strings(banners[1].GetProperty("fields")));
        Assert.DoesNotContain("Lights out", banners.GetRawText(), StringComparison.Ordinal);
        Assert.Empty((await UpdatesAsync(mom, familyId)).GetProperty("sections").EnumerateArray());
    }

    [Fact]
    public async Task Emergency_contacts_and_caregivers_name_changed_entries_without_their_details()
    {
        var (dad, mom, familyId, kaiId) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        var child = $"/api/families/{familyId}/children/{kaiId}/essentials";
        var grandma = new { name = "Rosa Diaz", relationship = "Grandmother", phone = "555-010-2000", callFirst = true };
        var neighbor = new { name = "Sam Lee", relationship = "Neighbor", phone = "555-010-3000", callFirst = false };
        Assert.Equal(HttpStatusCode.OK, (await mom.SendAsync(HttpMethod.Put, $"{child}/emergency-contacts",
            new { version = 0, contacts = new object[] { grandma } })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await mom.SendAsync(HttpMethod.Put, $"{child}/emergency-contacts",
            new { version = 1, contacts = new object[] { grandma, neighbor } })).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await mom.PostAsync($"{child}/caregivers",
            new { version = 0, details = new { name = "Ava Park", phone = "555-010-4000", schoolPickup = true } })).StatusCode);
        var caregiverId = (await JsonAsync(await mom.GetAsync($"{child}/caregivers"))).GetProperty("caregivers")[0].GetProperty("id").GetString()!;
        // A rating is Mom's own: no notice.
        Assert.Equal(HttpStatusCode.NoContent, (await mom.SendAsync(HttpMethod.Put, $"{child}/caregivers/{caregiverId}/rating", new { rating = 3 })).StatusCode);

        var view = await UpdatesAsync(dad, familyId);
        var contacts = view.GetProperty("sections").EnumerateArray().Single(s => s.GetProperty("section").GetString() == "emergencyContacts");
        var savedContacts = (await JsonAsync(await mom.GetAsync($"{child}/emergency-contacts"))).GetProperty("contacts");
        var grandmaId = savedContacts[0].GetProperty("id").GetString()!;
        var neighborId = savedContacts[1].GetProperty("id").GetString()!;
        Assert.Equal([grandmaId, neighborId], Strings(contacts.GetProperty("rows")));
        var caregivers = view.GetProperty("sections").EnumerateArray().Single(s => s.GetProperty("section").GetString() == "caregivers");
        Assert.Equal([caregiverId], Strings(caregivers.GetProperty("rows")));
        Assert.Equal(3L, await NoticeCountAsync(familyId));
        foreach (var value in new[] { "Rosa", "555-010-", "Ava", "Grandmother" })
        {
            Assert.DoesNotContain(value, view.GetRawText(), StringComparison.Ordinal);
        }

        // Removing the caregiver: its row can't come on screen, so it stops being highlighted; the removal still shows.
        Assert.Equal(HttpStatusCode.NoContent, (await mom.SendAsync(HttpMethod.Delete, $"{child}/caregivers/{caregiverId}?version=1")).StatusCode);
        // Moving the neighbor to Call first keeps both contacts' IDs.
        var reordered = await JsonAsync(await mom.SendAsync(HttpMethod.Put, $"{child}/emergency-contacts",
            new { version = 2, contacts = new object[] { grandma with { callFirst = false }, neighbor with { callFirst = true } } }));
        Assert.Equal([neighborId, grandmaId], reordered.GetProperty("contacts").EnumerateArray()
            .Select(contact => contact.GetProperty("id").GetString()!).ToList());

        // Removing the first contact moves Grandma up without moving the neighbor's highlight onto her.
        Assert.Equal(HttpStatusCode.OK, (await mom.SendAsync(HttpMethod.Put, $"{child}/emergency-contacts",
            new { version = 3, contacts = new object[] { grandma with { callFirst = false } } })).StatusCode);
        view = await UpdatesAsync(dad, familyId);
        Assert.Equal([grandmaId], Strings(view.GetProperty("sections").EnumerateArray()
            .Single(s => s.GetProperty("section").GetString() == "emergencyContacts").GetProperty("rows")));
        Assert.Empty(view.GetProperty("sections").EnumerateArray()
            .Single(s => s.GetProperty("section").GetString() == "caregivers").GetProperty("rows").EnumerateArray());
        var banners = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/essentials/updates/opened"));
        Assert.Contains("removed", Strings(banners.EnumerateArray().Single(b => b.GetProperty("section").GetString() == "caregivers").GetProperty("fields")));
    }

    [Fact]
    public async Task Indicators_are_for_this_familys_parents_only_and_go_when_the_parent_leaves()
    {
        var (dad, mom, familyId, kaiId) = await FamilyAsync();
        using var _ = dad;
        await mom.SendAsync(HttpMethod.Put, $"/api/families/{familyId}/children/{kaiId}/essentials/clothing",
            new { revision = 0, values = new { shoeSize = "Size 3" } });
        var updates = $"/api/families/{familyId}/essentials/updates";

        using var outsider = await ApiSession.SignedInAsync(api);
        await outsider.CreateFamilyAsync("Other family");
        Assert.Contains((await outsider.GetAsync(updates)).StatusCode, new[] { HttpStatusCode.Forbidden, HttpStatusCode.NotFound });
        Assert.Contains((await outsider.PostAsync(updates + "/opened")).StatusCode, new[] { HttpStatusCode.Forbidden, HttpStatusCode.NotFound });

        Assert.Equal(HttpStatusCode.BadRequest,
            (await dad.PostAsync(updates + "/sections", new { childId = kaiId, section = "diary" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await dad.PostAsync(updates + "/rows", new { childId = kaiId, section = "clothing", fields = Array.Empty<string>() })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await dad.PostAsync(updates + "/opened", withAntiforgery: false)).StatusCode);

        // Dad saves for Mom; when Mom leaves, her notices go with her.
        await dad.SendAsync(HttpMethod.Put, $"/api/families/{familyId}/children/{kaiId}/essentials/school",
            new { revision = 0, values = new { grade = "2" } });
        Assert.Equal(2L, await NoticeCountAsync(familyId));
        Assert.Equal(HttpStatusCode.NoContent, (await mom.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);
        mom.Dispose();
        Assert.Equal(1L, await NoticeCountAsync(familyId));
    }

    private Task<long> NoticeCountAsync(Guid familyId) =>
        api.QueryScalarAsync<long>("select count(*) from families.essentials_updates where family_id = @v", ("v", familyId));

    private static async Task<JsonElement> UpdatesAsync(ApiSession parent, Guid familyId) =>
        await JsonAsync(await parent.GetAsync($"/api/families/{familyId}/essentials/updates"));

    private static List<string> Strings(JsonElement array) => array.EnumerateArray().Select(e => e.GetString()!).ToList();

    private async Task<(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid KaiId)> FamilyAsync()
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        var familyId = await dad.CreateFamilyAsync();
        var kai = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Kai" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Mom", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await mom.PostAsync($"/api/families/{familyId}/approvals/{kai.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        return (dad, mom, familyId, kai.GetProperty("id").GetGuid());
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
