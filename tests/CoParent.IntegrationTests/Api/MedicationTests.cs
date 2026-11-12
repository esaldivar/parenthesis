using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Parent-entered medication reference (#127); decisions in docs/privacy/medication-preflight-127.md.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class MedicationTests(ApiFactory api) : IAsyncLifetime
{
    // Synthetic values that must never leave the protected record (update notices, history after deletion).
    private const string Sentinel = "SYNTHETIC-MED-7f3a";

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Either_parent_saves_after_confirming_once_and_the_other_parent_sees_it()
    {
        var (parent, coParent, family, child) = await FamilyAsync();
        using var _ = parent;
        using var __ = coParent;
        var path = $"/api/families/{family}/children/{child}/essentials/medication";

        var empty = await JsonAsync(await parent.GetAsync(path));
        Assert.Equal(0, empty.GetProperty("revision").GetInt32());
        Assert.False(empty.GetProperty("acknowledged").GetBoolean());
        Assert.Empty(empty.GetProperty("entries").EnumerateArray());

        var id = Guid.NewGuid();
        var entry = new { id, name = Sentinel, dose = "5 mL", schedule = "Before bed", instructions = (string?)null, discontinued = false };
        using var unconfirmed = await parent.SendAsync(HttpMethod.Put, path, new { revision = 0, entries = new[] { entry } });
        Assert.Equal(HttpStatusCode.PreconditionRequired, unconfirmed.StatusCode);
        using var missingName = await parent.SendAsync(HttpMethod.Put, path,
            new { revision = 0, entries = new[] { entry with { name = " " } }, acknowledge = true });
        Assert.Equal(HttpStatusCode.BadRequest, missingName.StatusCode);

        var saved = await JsonAsync(await parent.SendAsync(HttpMethod.Put, path,
            new { revision = 0, entries = new[] { entry }, acknowledge = true }));
        Assert.True(saved.GetProperty("acknowledged").GetBoolean());
        var item = Assert.Single(saved.GetProperty("entries").EnumerateArray());
        Assert.Equal(Sentinel, item.GetProperty("name").GetString());
        Assert.Equal("5 mL", item.GetProperty("dose").GetString());
        Assert.False(string.IsNullOrEmpty(item.GetProperty("updatedBy").GetString()));

        // The co-parent sees it without approving anything, and confirms the notice for themselves.
        var seen = await JsonAsync(await coParent.GetAsync(path));
        Assert.False(seen.GetProperty("acknowledged").GetBoolean());
        Assert.Equal(Sentinel, Assert.Single(seen.GetProperty("entries").EnumerateArray()).GetProperty("name").GetString());
        using var stale = await coParent.SendAsync(HttpMethod.Put, path,
            new { revision = 0, entries = new[] { entry with { dose = "10 mL" } }, acknowledge = true });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var discontinued = await JsonAsync(await coParent.SendAsync(HttpMethod.Put, path,
            new { revision = 1, entries = new[] { entry with { discontinued = true } } }));
        Assert.True(Assert.Single(discontinued.GetProperty("entries").EnumerateArray()).GetProperty("discontinued").GetBoolean());

        // Removing an entry is only the separate permanent delete.
        using var dropped = await parent.SendAsync(HttpMethod.Put, path, new { revision = 2, entries = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.BadRequest, dropped.StatusCode);

        var history = await JsonAsync(await parent.GetAsync(path + "/history"));
        Assert.Equal(2, history.GetProperty("entries").GetArrayLength());

        // The other parent's notice names the entry by id, never by its values.
        using var updates = await parent.GetAsync($"/api/families/{family}/essentials/updates");
        var raw = await updates.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Contains(id.ToString(), raw, StringComparison.Ordinal);
        Assert.DoesNotContain(Sentinel, raw, StringComparison.Ordinal);

        using var outsider = await ApiSession.SignedInAsync(api);
        await outsider.CreateFamilyAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.SendAsync(HttpMethod.Delete, $"{path}/{id}")).StatusCode);
    }

    [Fact]
    public async Task Permanent_delete_removes_the_entry_from_every_revision_and_notice()
    {
        var (parent, coParent, family, child) = await FamilyAsync();
        using var _ = parent;
        using var __ = coParent;
        var path = $"/api/families/{family}/children/{child}/essentials/medication";
        var deleted = new { id = Guid.NewGuid(), name = Sentinel, dose = (string?)"5 mL", schedule = (string?)null, instructions = (string?)null, discontinued = false };
        var kept = new { id = Guid.NewGuid(), name = "Sample vitamin", dose = (string?)null, schedule = (string?)"Mornings", instructions = (string?)null, discontinued = false };

        await JsonAsync(await parent.SendAsync(HttpMethod.Put, path, new { revision = 0, entries = new[] { deleted }, acknowledge = true }));
        await JsonAsync(await parent.SendAsync(HttpMethod.Put, path, new { revision = 1, entries = new[] { deleted, kept } }));
        await JsonAsync(await parent.SendAsync(HttpMethod.Put, path, new { revision = 2, entries = new[] { deleted with { dose = "10 mL" }, kept } }));

        var after = await JsonAsync(await coParent.SendAsync(HttpMethod.Delete, $"{path}/{deleted.id}"));
        Assert.Equal(kept.id, Assert.Single(after.GetProperty("entries").EnumerateArray()).GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.NotFound, (await coParent.SendAsync(HttpMethod.Delete, $"{path}/{deleted.id}")).StatusCode);

        // Only the save that added the kept entry, and the deletion, remain; neither mentions the deleted entry.
        using var history = await parent.GetAsync(path + "/history");
        var raw = await history.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.DoesNotContain(Sentinel, raw, StringComparison.Ordinal);
        Assert.DoesNotContain(deleted.id.ToString(), raw, StringComparison.Ordinal);
        var entries = (await JsonAsync(history)).GetProperty("entries").EnumerateArray().ToList();
        Assert.Equal(2, entries.Count);
        Assert.Equal(entries[0].GetProperty("previous").GetRawText(), entries[0].GetProperty("current").GetRawText());

        using var updates = await parent.GetAsync($"/api/families/{family}/essentials/updates");
        Assert.DoesNotContain(deleted.id.ToString(),
            await updates.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);
        using var opened = await parent.PostAsync($"/api/families/{family}/essentials/updates/opened");
        var banners = await opened.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        Assert.Contains("deleted", banners, StringComparison.Ordinal);
        Assert.DoesNotContain(Sentinel, banners, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Pdf_is_private_dated_and_offers_current_medications_only()
    {
        var (parent, coParent, family, child) = await FamilyAsync();
        using var _ = parent;
        using var __ = coParent;
        var path = $"/api/families/{family}/children/{child}/essentials/medication";
        await JsonAsync(await parent.SendAsync(HttpMethod.Put, path, new
        {
            revision = 0,
            acknowledge = true,
            entries = new[]
            {
                new { id = Guid.NewGuid(), name = "Sample tablet", dose = "1 tablet", schedule = "Daily", instructions = (string?)"With food", discontinued = false },
                new { id = Guid.NewGuid(), name = "Old sample syrup", dose = "5 mL", schedule = "Nightly", instructions = (string?)null, discontinued = true },
            },
        }));

        var pdfPath = $"/api/families/{family}/child-essentials/medication/pdf";
        var token = TestContext.Current.CancellationToken;
        foreach (var url in new[] { $"{pdfPath}?childId={child}", pdfPath, $"{pdfPath}?currentOnly=true&language=es-419" })
        {
            using var pdf = await coParent.GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, pdf.StatusCode);
            Assert.Equal("application/pdf", pdf.Content.Headers.ContentType?.MediaType);
            Assert.True(pdf.Headers.CacheControl?.NoStore == true);
            Assert.StartsWith("medications-", pdf.Content.Headers.ContentDisposition?.FileName?.Trim('"'), StringComparison.Ordinal);
            var bytes = await pdf.Content.ReadAsByteArrayAsync(token);
            Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString(bytes[..4]), StringComparison.Ordinal);
        }

        using var outsider = await ApiSession.SignedInAsync(api);
        await outsider.CreateFamilyAsync();
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"{pdfPath}?childId={child}")).StatusCode);
    }

    /// <summary>Two parents and one approved child.</summary>
    private async Task<(ApiSession Parent, ApiSession CoParent, Guid Family, Guid Child)> FamilyAsync()
    {
        var parent = await ApiSession.SignedInAsync(api);
        var family = await parent.CreateFamilyAsync();
        using var proposed = await parent.PostAsync($"/api/families/{family}/children", new { firstName = "Sam" });
        var child = await JsonAsync(proposed);
        var email = ApiSession.NewEmail();
        await parent.PostAsync($"/api/families/{family}/invitations", new { email });
        var invite = QueryHelpers.ParseQuery(parent.Emails.LatestLink(email, "invited").Query)["token"].ToString();
        var coParent = await ApiSession.SignedInAsync(api, email: email);
        using var accepted = await coParent.PostAsync("/api/invitations/accept", new { token = invite });
        accepted.EnsureSuccessStatusCode();
        using var approved = await coParent.PostAsync(
            $"/api/families/{family}/approvals/{child.GetProperty("changeRequestId").GetGuid()}/approve");
        approved.EnsureSuccessStatusCode();
        return (parent, coParent, family, child.GetProperty("id").GetGuid());
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
