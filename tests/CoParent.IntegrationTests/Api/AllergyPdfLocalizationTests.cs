using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// The allergy reference export: localized labels must not change parent/child authorization (#577), and the branded
/// layout (#662) keeps the dated file name and runs long notes and several children onto further pages.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed partial class AllergyPdfLocalizationTests(ApiFactory api) : IAsyncLifetime
{
    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Theory]
    [InlineData("es-419", "es-419", "Referencia de alergias infantiles")]
    [InlineData("en", "en", "Child allergy reference")]
    [InlineData("unsupported", "en", "Child allergy reference")]
    [InlineData(null, "en", "Child allergy reference")]
    public async Task Export_localizes_document_title_and_keeps_child_selection_and_tenant_checks(
        string? language, string expectedLanguage, string expectedTitle)
    {
        var (dad, mom, familyId, childId) = await FamilyAsync();
        using var _d = dad;
        using var _m = mom;
        var endpoint = $"/api/families/{familyId}/child-essentials/allergies/pdf";
        var query = $"?childId={childId}" + (language is null ? "" : $"&language={language}");
        using var response = await dad.GetAsync(endpoint + query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.Contains(expectedLanguage, response.Content.Headers.ContentLanguage);
        var bytes = await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
        var pdf = Encoding.Latin1.GetString(bytes);
        Assert.StartsWith("%PDF-", pdf, StringComparison.Ordinal);
        // Skia's PDF info dictionary stores these ASCII document titles without compression.
        Assert.Contains(expectedTitle, pdf, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.NotFound,
            (await dad.GetAsync(endpoint + $"?childId={Guid.NewGuid()}&language=es-419")).StatusCode);
        using var outsider = await ApiSession.SignedInAsync(api);
        await outsider.CreateFamilyAsync("Other family");
        Assert.Contains((await outsider.GetAsync(endpoint + query)).StatusCode,
            new[] { HttpStatusCode.Forbidden, HttpStatusCode.NotFound });
    }

    [Fact]
    public async Task Branded_reference_names_the_dated_file_and_runs_long_notes_and_several_children_onto_more_pages()
    {
        var (dad, mom, familyId, sam) = await FamilyAsync();
        using var _d = dad;
        using var _m = mom;
        var endpoint = $"/api/families/{familyId}/child-essentials/allergies/pdf";

        // Nothing recorded yet: one page, under the server's dated name.
        using (var response = await dad.GetAsync($"{endpoint}?childId={sam}"))
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Matches(@"^allergies-\d{4}-\d{2}-\d{2}\.pdf$", response.Content.Headers.ContentDisposition?.FileName?.Trim('"') ?? "");
            Assert.Equal(1, Pages(await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken)));
        }

        // A second child, then notes long enough to need another page; the export for everyone grows with them.
        var ali = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Ali" }));
        Assert.Equal(HttpStatusCode.OK,
            (await mom.PostAsync($"/api/families/{familyId}/approvals/{ali.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        Assert.Equal(1, Pages(await PdfAsync(dad, endpoint)));
        var longNotes = string.Join('\n', Enumerable.Repeat("Synthetic allergy note.", 40));
        await SaveAsync(dad, familyId, sam, new { allergies = longNotes, foodPreferences = (string?)null, noKnownAllergies = false });
        Assert.True(Pages(await PdfAsync(dad, $"{endpoint}?childId={sam}")) > 1);
        Assert.True(Pages(await PdfAsync(dad, endpoint)) > 1);
    }

    private async Task<(ApiSession Dad, ApiSession Mom, Guid FamilyId, Guid ChildId)> FamilyAsync()
    {
        var momEmail = ApiSession.NewEmail();
        var dad = await ApiSession.SignedInAsync(api, displayName: "Alex Rivera");
        var familyId = await dad.CreateFamilyAsync();
        var child = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Sam" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, displayName: "Jordan Rivera", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await mom.PostAsync($"/api/families/{familyId}/approvals/{child.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        return (dad, mom, familyId, child.GetProperty("id").GetGuid());
    }

    private static async Task SaveAsync(ApiSession parent, Guid familyId, Guid childId, object values)
    {
        var url = $"/api/families/{familyId}/children/{childId}/essentials/allergies-food";
        var revision = (await JsonAsync(await parent.GetAsync(url))).GetProperty("revision").GetInt32();
        Assert.Equal(HttpStatusCode.OK, (await parent.SendAsync(HttpMethod.Put, url, new { revision, values })).StatusCode);
    }

    private static async Task<byte[]> PdfAsync(ApiSession parent, string path)
    {
        using var response = await parent.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
    }

    private static int Pages(byte[] pdf) => PageObject().Count(Encoding.Latin1.GetString(pdf));

    [GeneratedRegex(@"/Type\s*/Page(?![s\w])")]
    private static partial Regex PageObject();

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
