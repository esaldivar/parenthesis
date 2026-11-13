using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

/// <summary>Localized PDF labels must not change the export's parent/child authorization (#577).</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class AllergyPdfLocalizationTests(ApiFactory api) : IAsyncLifetime
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
        var momEmail = ApiSession.NewEmail();
        using var dad = await ApiSession.SignedInAsync(api, displayName: "Alex Rivera");
        var familyId = await dad.CreateFamilyAsync();
        var child = await JsonAsync(await dad.PostAsync($"/api/families/{familyId}/children", new { firstName = "Sam" }));
        await dad.PostAsync($"/api/families/{familyId}/invitations", new { email = momEmail });
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(momEmail, "invited").Query)["token"].ToString();
        using var mom = await ApiSession.SignedInAsync(api, displayName: "Jordan Rivera", email: momEmail);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await mom.PostAsync($"/api/families/{familyId}/approvals/{child.GetProperty("changeRequestId").GetGuid()}/approve")).StatusCode);
        var childId = child.GetProperty("id").GetGuid();
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

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
