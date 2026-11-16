using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Child Essentials School contact and address fields (#655). Synthetic family only.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class SchoolTests(ApiFactory api) : IAsyncLifetime
{
    private static readonly string[] _newFields = ["schoolName", "schoolAddress", "teacherEmail", "teacherPhone"];

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task New_fields_save_reload_and_appear_in_history_while_older_saves_stay_usable()
    {
        var (dad, mom, familyId, kaiId) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        var school = $"/api/families/{familyId}/children/{kaiId}/essentials/school";

        // A save in the old shape (no new fields) still works and reads back with the new fields empty.
        Assert.Equal(HttpStatusCode.OK,
            (await mom.SendAsync(HttpMethod.Put, school, new { revision = 0, values = new { grade = "3", homeroomTeacher = "Ms. Test" } })).StatusCode);
        var first = (await JsonAsync(await dad.GetAsync(school))).GetProperty("values");
        Assert.Equal("Ms. Test", first.GetProperty("homeroomTeacher").GetString());
        Assert.Equal(JsonValueKind.Null, first.GetProperty("schoolName").ValueKind);
        Assert.Equal(JsonValueKind.Null, first.GetProperty("teacherPhone").ValueKind);

        // The new fields are kept as typed: an international number with an extension is not reformatted.
        var saved = await dad.SendAsync(HttpMethod.Put, school, new
        {
            revision = 1,
            values = new
            {
                grade = "3",
                homeroomTeacher = "Ms. Test",
                schoolName = "  Example Elementary ",
                schoolAddress = "1 Sample Way\nTestville",
                teacherEmail = "teacher@example.com",
                teacherPhone = "+44 20 7946 0000 ext. 12",
            },
        });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var values = (await JsonAsync(await mom.GetAsync(school))).GetProperty("values");
        Assert.Equal("Example Elementary", values.GetProperty("schoolName").GetString());
        Assert.Equal("1 Sample Way\nTestville", values.GetProperty("schoolAddress").GetString());
        Assert.Equal("teacher@example.com", values.GetProperty("teacherEmail").GetString());
        Assert.Equal("+44 20 7946 0000 ext. 12", values.GetProperty("teacherPhone").GetString());

        // History has both saves, newest first, with previous and saved values.
        var entries = (await JsonAsync(await mom.GetAsync(school + "/history"))).GetProperty("entries");
        Assert.Equal(2, entries.GetArrayLength());
        Assert.Equal(JsonValueKind.Null, entries[0].GetProperty("previous").GetProperty("schoolName").ValueKind);
        Assert.Equal("Example Elementary", entries[0].GetProperty("current").GetProperty("schoolName").GetString());

        // Mom gets row cues for exactly the fields Dad changed.
        var section = (await JsonAsync(await mom.GetAsync($"/api/families/{familyId}/essentials/updates")))
            .GetProperty("sections").EnumerateArray().Single(s => s.GetProperty("section").GetString() == "school");
        Assert.Equal(_newFields.Order(StringComparer.Ordinal),
            section.GetProperty("rows").EnumerateArray().Select(e => e.GetString()!).Order(StringComparer.Ordinal));

        // A stale save still conflicts and returns the latest values.
        var stale = await mom.SendAsync(HttpMethod.Put, school, new { revision = 1, values = new { grade = "4" } });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Equal("Example Elementary", (await JsonAsync(stale)).GetProperty("values").GetProperty("schoolName").GetString());

        // A tab still running the app from before these fields leaves them out: they keep their saved values.
        Assert.Equal(HttpStatusCode.OK,
            (await mom.SendAsync(HttpMethod.Put, school, new { revision = 2, values = new { grade = "4", homeroomTeacher = (string?)null } })).StatusCode);
        var kept = (await JsonAsync(await dad.GetAsync(school))).GetProperty("values");
        Assert.Equal("4", kept.GetProperty("grade").GetString());
        Assert.Equal("Example Elementary", kept.GetProperty("schoolName").GetString());
        Assert.Equal("1 Sample Way\nTestville", kept.GetProperty("schoolAddress").GetString());
        Assert.Equal("teacher@example.com", kept.GetProperty("teacherEmail").GetString());
        Assert.Equal("+44 20 7946 0000 ext. 12", kept.GetProperty("teacherPhone").GetString());

        // Sent as null or empty, a field is cleared.
        Assert.Equal(HttpStatusCode.OK, (await dad.SendAsync(HttpMethod.Put, school, new
        {
            revision = 3,
            values = new
            {
                grade = "4",
                schoolName = (string?)null,
                schoolAddress = "1 Sample Way\nTestville",
                teacherEmail = "",
                teacherPhone = "+44 20 7946 0000 ext. 12",
            },
        })).StatusCode);
        var cleared = (await JsonAsync(await mom.GetAsync(school))).GetProperty("values");
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("schoolName").ValueKind);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("teacherEmail").ValueKind);
        Assert.Equal("1 Sample Way\nTestville", cleared.GetProperty("schoolAddress").GetString());
    }

    [Fact]
    public async Task Invalid_new_values_are_refused_and_other_families_cannot_read_or_write()
    {
        var (dad, mom, familyId, kaiId) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        var school = $"/api/families/{familyId}/children/{kaiId}/essentials/school";

        Assert.Equal(HttpStatusCode.BadRequest,
            (await dad.SendAsync(HttpMethod.Put, school, new { revision = 0, values = new { teacherEmail = "not an email" } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await dad.SendAsync(HttpMethod.Put, school, new { revision = 0, values = new { teacherPhone = new string('1', 65) } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await dad.SendAsync(HttpMethod.Put, school, new { revision = 0, values = new { schoolName = new string('x', 1001) } })).StatusCode);
        Assert.Equal(0, (await JsonAsync(await dad.GetAsync(school))).GetProperty("revision").GetInt32());

        using var outsider = await ApiSession.SignedInAsync(api, displayName: "Outsider");
        await outsider.CreateFamilyAsync();
        Assert.False((await outsider.GetAsync(school)).IsSuccessStatusCode);
        Assert.False((await outsider.SendAsync(HttpMethod.Put, school,
            new { revision = 0, values = new { schoolName = "Example Elementary" } })).IsSuccessStatusCode);
        Assert.Equal(0, (await JsonAsync(await dad.GetAsync(school))).GetProperty("revision").GetInt32());
    }

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
