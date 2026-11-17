using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// The combined Medical reference PDF (#659): providers and medication for the chosen child or all children, current
/// medications only on request, real page counts, and the same parent-only, family-scoped access as before.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed partial class MedicalReferencePdfTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Empty_and_populated_references_fit_one_page_and_name_the_document()
    {
        var (parent, coParent, family, sam, _) = await FamilyAsync();
        using var _p = parent;
        using var _c = coParent;
        var pdfPath = $"/api/families/{family}/child-essentials/medication/pdf?childId={sam}";

        var empty = await PdfAsync(coParent, pdfPath);
        Assert.Equal(1, Pages(empty));
        Assert.Contains("Medical reference", Encoding.Latin1.GetString(empty), StringComparison.Ordinal);

        await AddProviderAsync(parent, family, sam, "Doctor", "Dr. Synthetic Reed", "5125550142", [sam]);
        await AddProviderAsync(parent, family, sam, "Dentist", "Example Dental", "+44 20 7946 0958", [sam]);
        await SaveMedicationAsync(parent, family, sam, [Medication("Sample tablet", "With food", false)]);
        var populated = await PdfAsync(coParent, pdfPath);
        Assert.Equal(1, Pages(populated));
        Assert.True(populated.Length > empty.Length);
    }

    [Fact]
    public async Task Long_content_runs_onto_more_pages_and_current_only_leaves_out_discontinued_entries()
    {
        var (parent, coParent, family, sam, _) = await FamilyAsync();
        using var _p = parent;
        using var _c = coParent;
        var longText = string.Join(' ', Enumerable.Repeat("Synthetic instruction text for a long entry.", 22));
        await SaveMedicationAsync(parent, family, sam,
        [
            .. Enumerable.Range(1, 6).Select(i => Medication($"Current sample {i}", longText, false)),
            .. Enumerable.Range(1, 12).Select(i => Medication($"Old sample {i}", longText, true)),
        ]);
        var path = $"/api/families/{family}/child-essentials/medication/pdf?childId={sam}";

        var everything = Pages(await PdfAsync(parent, path));
        var currentOnly = Pages(await PdfAsync(parent, path + "&currentOnly=true"));
        Assert.True(currentOnly > 1, $"Expected several pages, got {currentOnly}.");
        Assert.True(everything > currentOnly, $"Discontinued entries should add pages ({everything} vs {currentOnly}).");
    }

    [Fact]
    public async Task All_children_start_on_their_own_pages_and_one_child_stays_on_one()
    {
        var (parent, coParent, family, sam, jo) = await FamilyAsync();
        using var _p = parent;
        using var _c = coParent;
        await AddProviderAsync(parent, family, sam, "Optometrist", "Bright Sample Eyes", null, [sam, jo]);
        var path = $"/api/families/{family}/child-essentials/medication/pdf";

        Assert.Equal(2, Pages(await PdfAsync(parent, path)));
        Assert.Equal(1, Pages(await PdfAsync(parent, $"{path}?childId={jo}")));
        using var spanish = await parent.GetAsync($"{path}?childId={jo}&language=es-419");
        Assert.Equal(HttpStatusCode.OK, spanish.StatusCode);
        Assert.Contains("es-419", spanish.Content.Headers.ContentLanguage);
        Assert.Equal(1, Pages(await spanish.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken)));
    }

    [Fact]
    public async Task Another_family_cannot_download_this_familys_reference()
    {
        var (parent, coParent, family, sam, _) = await FamilyAsync();
        using var _p = parent;
        using var _c = coParent;
        await AddProviderAsync(parent, family, sam, "Doctor", "Dr. Synthetic Reed", "5125550142", [sam]);
        var path = $"/api/families/{family}/child-essentials/medication/pdf";

        using var outsider = await ApiSession.SignedInAsync(api);
        var own = await outsider.CreateFamilyAsync();
        Assert.Contains((await outsider.GetAsync(path)).StatusCode, new[] { HttpStatusCode.Forbidden, HttpStatusCode.NotFound });
        // Their own family has no children, and another family's child id isn't found in it.
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.GetAsync($"/api/families/{own}/child-essentials/medication/pdf?childId={sam}")).StatusCode);
    }

    /// <summary>Skia writes each page dictionary uncompressed, so pages can be counted without a PDF reader.</summary>
    private static int Pages(byte[] pdf) => PageObject().Count(Encoding.Latin1.GetString(pdf));

    [GeneratedRegex(@"/Type\s*/Page(?![s\w])")]
    private static partial Regex PageObject();

    private static async Task<byte[]> PdfAsync(ApiSession session, string path)
    {
        using var response = await session.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.True(response.Headers.CacheControl?.NoStore == true);
        var bytes = await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
        Assert.StartsWith("%PDF", Encoding.ASCII.GetString(bytes[..4]), StringComparison.Ordinal);
        return bytes;
    }

    private static object Medication(string name, string? instructions, bool discontinued) =>
        new { id = Guid.NewGuid(), name, dose = "1 tablet", schedule = "Daily", instructions, discontinued };

    private static async Task SaveMedicationAsync(ApiSession parent, Guid family, Guid child, object[] entries)
    {
        using var response = await parent.SendAsync(HttpMethod.Put,
            $"/api/families/{family}/children/{child}/essentials/medication",
            new { revision = 0, acknowledge = true, entries });
        response.EnsureSuccessStatusCode();
    }

    private static async Task AddProviderAsync(
        ApiSession parent, Guid family, Guid child, string type, string name, string? phone, Guid[] children)
    {
        using var response = await parent.PostAsync($"/api/families/{family}/children/{child}/essentials/medical", new
        {
            provider = new
            {
                id = Guid.NewGuid(),
                type,
                name,
                specialty = (string?)null,
                practice = "Synthetic Practice",
                phone,
                address = phone is null ? null : "100 Example Street",
            },
            childIds = children,
        });
        response.EnsureSuccessStatusCode();
    }

    /// <summary>Two parents and two approved children, Sam and Jo.</summary>
    private async Task<(ApiSession Parent, ApiSession CoParent, Guid Family, Guid Sam, Guid Jo)> FamilyAsync()
    {
        var parent = await ApiSession.SignedInAsync(api);
        var family = await parent.CreateFamilyAsync();
        using var proposedSam = await parent.PostAsync($"/api/families/{family}/children", new { firstName = "Sam" });
        var sam = await JsonAsync(proposedSam);
        using var proposedJo = await parent.PostAsync($"/api/families/{family}/children", new { firstName = "Jo" });
        var jo = await JsonAsync(proposedJo);
        var email = ApiSession.NewEmail();
        await parent.PostAsync($"/api/families/{family}/invitations", new { email });
        var invite = QueryHelpers.ParseQuery(parent.Emails.LatestLink(email, "invited").Query)["token"].ToString();
        var coParent = await ApiSession.SignedInAsync(api, email: email);
        using var accepted = await coParent.PostAsync("/api/invitations/accept", new { token = invite });
        accepted.EnsureSuccessStatusCode();
        foreach (var child in new[] { sam, jo })
        {
            using var approved = await coParent.PostAsync(
                $"/api/families/{family}/approvals/{child.GetProperty("changeRequestId").GetGuid()}/approve");
            approved.EnsureSuccessStatusCode();
        }

        return (parent, coParent, family, sam.GetProperty("id").GetGuid(), jo.GetProperty("id").GetGuid());
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
    }
}
