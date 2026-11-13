using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Npgsql;

namespace CoParent.IntegrationTests.Api;

/// <summary>Custom routines in Child Essentials (#498): only what parents add, for one or more children at once.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class RoutinesTests(ApiFactory api) : IAsyncLifetime
{
    private const string Legacy = "SYNTHETIC-LEGACY-BEDTIME";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Legacy_bedtime_and_naps_stay_in_storage_but_out_of_the_list()
    {
        var f = await FamilyAsync();
        using var _ = f.Parent;
        using var __ = f.CoParent;
        await using (var connection = new NpgsqlConnection(api.ConnectionString))
        {
            await connection.OpenAsync(TestContext.Current.CancellationToken);
            await using var insert = new NpgsqlCommand("""
                INSERT INTO families.child_routines_revisions
                    (id, family_id, child_profile_id, owner_membership_id, revision, edited_by_user_id, edited_at, bedtime, naps)
                VALUES (@id, @family, @child, @owner, 1, @user, now(), @legacy, 'Synthetic nap')
                """, connection);
            insert.Parameters.AddWithValue("id", Guid.NewGuid());
            insert.Parameters.AddWithValue("family", f.Family);
            insert.Parameters.AddWithValue("child", f.Sam);
            insert.Parameters.AddWithValue("owner", Guid.Empty);
            insert.Parameters.AddWithValue("user", Guid.NewGuid());
            insert.Parameters.AddWithValue("legacy", Legacy);
            await insert.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        var path = Path(f, f.Sam);
        using var response = await f.Parent.GetAsync(path);
        var body = await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(Legacy, body, StringComparison.Ordinal);
        var view = JsonDocument.Parse(body).RootElement;
        Assert.Equal(1, view.GetProperty("revision").GetInt32());
        Assert.Empty(Entries(view));

        var routine = new { id = Guid.NewGuid(), title = "Brushing teeth", details = (string?)null };
        var saved = await JsonAsync(await f.Parent.SendAsync(HttpMethod.Put, path,
            new { revision = 1, values = new { entries = new[] { routine } } }));
        Assert.Equal("Brushing teeth", Assert.Single(Entries(saved)).GetProperty("title").GetString());
        using var history = await f.Parent.GetAsync(path + "/history");
        Assert.DoesNotContain(Legacy, await history.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);

        // The earlier value is still stored, on the old revision and carried onto the new one.
        await using var connectionAfter = new NpgsqlConnection(api.ConnectionString);
        await connectionAfter.OpenAsync(TestContext.Current.CancellationToken);
        await using var select = new NpgsqlCommand(
            "SELECT count(*) FROM families.child_routines_revisions WHERE child_profile_id = @child AND bedtime = @legacy",
            connectionAfter);
        select.Parameters.AddWithValue("child", f.Sam);
        select.Parameters.AddWithValue("legacy", Legacy);
        Assert.Equal(2L, await select.ExecuteScalarAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Adding_a_routine_saves_it_to_each_chosen_child_in_one_save()
    {
        var f = await FamilyAsync();
        using var _ = f.Parent;
        using var __ = f.CoParent;
        var add = $"/api/families/{f.Family}/essentials/routines";
        Assert.Empty(Entries(await JsonAsync(await f.Parent.GetAsync(Path(f, f.Sam)))));

        using var blank = await f.Parent.PostAsync(add, new { routine = new { title = "  " }, childIds = new[] { f.Sam }, visibility = "shared" });
        Assert.Equal(HttpStatusCode.BadRequest, blank.StatusCode);
        using var noChild = await f.Parent.PostAsync(add, new { routine = new { title = "Brushing teeth" }, childIds = Array.Empty<Guid>(), visibility = "shared" });
        Assert.Equal(HttpStatusCode.BadRequest, noChild.StatusCode);
        using var noVisibility = await f.Parent.PostAsync(add, new { routine = new { title = "Brushing teeth" }, childIds = new[] { f.Sam } });
        Assert.Equal(HttpStatusCode.BadRequest, noVisibility.StatusCode);
        using var unknownChild = await f.Parent.PostAsync(add,
            new { routine = new { title = "Brushing teeth" }, childIds = new[] { f.Sam, Guid.NewGuid() }, visibility = "shared" });
        Assert.Equal(HttpStatusCode.NotFound, unknownChild.StatusCode);
        Assert.Empty(Entries(await JsonAsync(await f.Parent.GetAsync(Path(f, f.Sam)))));

        var one = await JsonAsync(await f.Parent.PostAsync(add,
            new { routine = new { title = " Brushing teeth ", details = "After breakfast" }, childIds = new[] { f.Sam }, visibility = "shared" }));
        Assert.Equal(f.Sam, Assert.Single(one.EnumerateArray()).GetProperty("childId").GetGuid());
        Assert.Empty(Entries(await JsonAsync(await f.Parent.GetAsync(Path(f, f.Ali)))));

        var both = await JsonAsync(await f.Parent.PostAsync(add,
            new { routine = new { title = "Getting ready for school" }, childIds = new[] { f.Sam, f.Ali }, visibility = "shared" }));
        Assert.Equal(2, both.GetArrayLength());

        // The co-parent sees both children's lists; each child has an entry of their own.
        var sam = await JsonAsync(await f.CoParent.GetAsync(Path(f, f.Sam)));
        var ali = await JsonAsync(await f.CoParent.GetAsync(Path(f, f.Ali)));
        Assert.Equal(["Brushing teeth", "Getting ready for school"], Entries(sam).Select(e => e.GetProperty("title").GetString()).ToList());
        Assert.Equal("After breakfast", Entries(sam)[0].GetProperty("details").GetString());
        var aliEntry = Assert.Single(Entries(ali));
        Assert.Equal("Getting ready for school", aliEntry.GetProperty("title").GetString());
        Assert.NotEqual(Entries(sam)[1].GetProperty("id").GetGuid(), aliEntry.GetProperty("id").GetGuid());
        Assert.Equal(2, sam.GetProperty("revision").GetInt32());
        Assert.Equal(1, ali.GetProperty("revision").GetInt32());

        // The co-parent hears about each child's new routine.
        var banners = await JsonAsync(await f.CoParent.PostAsync($"/api/families/{f.Family}/essentials/updates/opened"));
        Assert.Equal(2, banners.EnumerateArray().Count(b => b.GetProperty("section").GetString() == "routines"));
    }

    [Fact]
    public async Task Either_parent_edits_a_routine_against_the_revision_they_saw_with_history()
    {
        var f = await FamilyAsync();
        using var _ = f.Parent;
        using var __ = f.CoParent;
        var path = Path(f, f.Sam);
        var added = await JsonAsync(await f.Parent.PostAsync($"/api/families/{f.Family}/essentials/routines",
            new { routine = new { title = "Brushing teeth" }, childIds = new[] { f.Sam }, visibility = "shared" }));
        var id = Entries(added[0].GetProperty("routines"))[0].GetProperty("id").GetGuid();

        var edited = await JsonAsync(await f.CoParent.SendAsync(HttpMethod.Put, path,
            new { revision = 1, values = new { entries = new[] { new { id, title = "Brushing teeth", details = "Two minutes" } } } }));
        Assert.Equal(2, edited.GetProperty("revision").GetInt32());
        using var stale = await f.Parent.SendAsync(HttpMethod.Put, path,
            new { revision = 1, values = new { entries = new[] { new { id, title = "Teeth", details = (string?)null } } } });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        using var untitled = await f.Parent.SendAsync(HttpMethod.Put, path,
            new { revision = 2, values = new { entries = new[] { new { id, title = "", details = (string?)null } } } });
        Assert.Equal(HttpStatusCode.BadRequest, untitled.StatusCode);
        using var duplicate = await f.Parent.SendAsync(HttpMethod.Put, path,
            new { revision = 2, values = new { entries = new[] { new { id, title = "A" }, new { id, title = "B" } } } });
        Assert.Equal(HttpStatusCode.BadRequest, duplicate.StatusCode);

        var history = (await JsonAsync(await f.Parent.GetAsync(path + "/history"))).GetProperty("entries");
        Assert.Equal(2, history.GetArrayLength());
        Assert.Null(Assert.Single(history[0].GetProperty("previous").GetProperty("entries").EnumerateArray())
            .GetProperty("details").GetString());
        Assert.Equal("Two minutes", Assert.Single(history[0].GetProperty("current").GetProperty("entries").EnumerateArray())
            .GetProperty("details").GetString());
    }

    [Fact]
    public async Task A_household_routine_goes_only_to_the_parents_own_list_until_the_co_parent_accepts_it()
    {
        var f = await FamilyAsync();
        using var _ = f.Parent;
        using var __ = f.CoParent;
        var added = await JsonAsync(await f.Parent.PostAsync($"/api/families/{f.Family}/essentials/routines",
            new { routine = new { title = "Reading before bed" }, childIds = new[] { f.Sam, f.Ali }, visibility = "mine" }));
        Assert.Equal(2, added.GetArrayLength());
        Assert.Empty(Entries(await JsonAsync(await f.CoParent.GetAsync(Path(f, f.Sam)))));

        var homes = await JsonAsync(await f.CoParent.GetAsync(Path(f, f.Ali) + "/households"));
        var parents = Assert.Single(homes.EnumerateArray(), home => !home.GetProperty("isMine").GetBoolean());
        Assert.Equal("Reading before bed", Assert.Single(Entries(parents.GetProperty("latest"))).GetProperty("title").GetString());
        Assert.True(parents.GetProperty("canAccept").GetBoolean());
        Assert.Equal(JsonValueKind.Null, parents.GetProperty("shared").ValueKind);
        var mine = Assert.Single(homes.EnumerateArray(), home => home.GetProperty("isMine").GetBoolean());
        Assert.Empty(Entries(mine.GetProperty("latest")));

        var banners = await JsonAsync(await f.CoParent.PostAsync($"/api/families/{f.Family}/essentials/updates/opened"));
        Assert.Equal(2, banners.EnumerateArray().Count(b => b.GetProperty("section").GetString() == "householdRoutines"));
    }

    private static string Path((ApiSession Parent, ApiSession CoParent, Guid Family, Guid Sam, Guid Ali) f, Guid child) =>
        $"/api/families/{f.Family}/children/{child}/essentials/routines";

    private static JsonElement[] Entries(JsonElement view) =>
        [.. view.GetProperty("values").GetProperty("entries").EnumerateArray()];

    /// <summary>Two parents and two approved children.</summary>
    private async Task<(ApiSession Parent, ApiSession CoParent, Guid Family, Guid Sam, Guid Ali)> FamilyAsync()
    {
        var parent = await ApiSession.SignedInAsync(api);
        var family = await parent.CreateFamilyAsync();
        var sam = await JsonAsync(await parent.PostAsync($"/api/families/{family}/children", new { firstName = "Sam" }));
        var ali = await JsonAsync(await parent.PostAsync($"/api/families/{family}/children", new { firstName = "Ali" }));
        var email = ApiSession.NewEmail();
        await parent.PostAsync($"/api/families/{family}/invitations", new { email });
        var invite = QueryHelpers.ParseQuery(parent.Emails.LatestLink(email, "invited").Query)["token"].ToString();
        var coParent = await ApiSession.SignedInAsync(api, email: email);
        using var accepted = await coParent.PostAsync("/api/invitations/accept", new { token = invite });
        accepted.EnsureSuccessStatusCode();
        foreach (var child in new[] { sam, ali })
        {
            using var approved = await coParent.PostAsync(
                $"/api/families/{family}/approvals/{child.GetProperty("changeRequestId").GetGuid()}/approve");
            approved.EnsureSuccessStatusCode();
        }

        return (parent, coParent, family, sam.GetProperty("id").GetGuid(), ali.GetProperty("id").GetGuid());
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using (response)
        {
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        }
    }
}
