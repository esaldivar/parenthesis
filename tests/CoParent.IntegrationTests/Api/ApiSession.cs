using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// A browser-like client: keeps cookies over HTTPS and, like Angular, echoes the XSRF-TOKEN cookie in the
/// X-XSRF-TOKEN header on unsafe requests.
/// </summary>
public sealed class ApiSession : IDisposable
{
    public const string Password = "correct horse battery staple";

    private string? _xsrfToken;

    private ApiSession(HttpClient client, FakeEmailSender emails)
    {
        Client = client;
        Emails = emails;
    }

    public FakeEmailSender Emails { get; }

    public HttpClient Client { get; }

    public static async Task<ApiSession> StartAsync(WebApplicationFactory<Program> api)
    {
        var emails = api.Services.GetRequiredService<FakeEmailSender>();
        var session = new ApiSession(api.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost"),
            HandleCookies = true,
        }), emails);
        await session.RefreshAntiforgeryAsync();
        return session;
    }

    /// <summary>Antiforgery tokens belong to the signed-in user, so refresh after signing in or out.</summary>
    public async Task RefreshAntiforgeryAsync()
    {
        var response = await Client.GetAsync("/api/antiforgery", TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        _xsrfToken = FindCookie(response, "XSRF-TOKEN") ?? throw new InvalidOperationException("No XSRF-TOKEN cookie issued.");
    }

    public Task<HttpResponseMessage> PostAsync(string path, object? body = null, bool withAntiforgery = true) =>
        SendAsync(HttpMethod.Post, path, body, withAntiforgery);

    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, object? body = null, bool withAntiforgery = true)
    {
        var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body ?? new { }) };
        if (withAntiforgery && _xsrfToken is not null)
        {
            request.Headers.Add("X-XSRF-TOKEN", _xsrfToken);
        }

        return Client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    public Task<HttpResponseMessage> GetAsync(string path) => Client.GetAsync(path, TestContext.Current.CancellationToken);

    public async Task<HttpResponseMessage> RegisterAsync(string email, string password = Password, string displayName = "Alex Rivera") =>
        await PostAsync("/api/auth/register", new { email, password, displayName });

    /// <summary>A confirmed, signed-in user ready to make authenticated calls.</summary>
    public static async Task<ApiSession> SignedInAsync(WebApplicationFactory<Program> api, string displayName = "Alex Rivera")
    {
        var session = await StartAsync(api);
        var email = NewEmail();
        await session.RegisterConfirmedAsync(email, displayName: displayName);
        Assert.Equal(System.Net.HttpStatusCode.NoContent, (await session.LoginAsync(email)).StatusCode);
        return session;
    }

    public async Task<Guid> CreateFamilyAsync(string name = "Rivera Family", string timeZone = "America/Chicago")
    {
        var response = await PostAsync("/api/families", new { name, timeZone });
        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(TestContext.Current.CancellationToken))
            .GetProperty("id").GetGuid();
    }

    /// <summary>Registers, then confirms by following the link in the confirmation email, as a user would.</summary>
    public async Task RegisterConfirmedAsync(string email, string password = Password, string displayName = "Alex Rivera")
    {
        Assert.Equal(System.Net.HttpStatusCode.Accepted, (await RegisterAsync(email, password, displayName)).StatusCode);
        Assert.Equal(System.Net.HttpStatusCode.NoContent, (await ConfirmFromEmailAsync(email)).StatusCode);
    }

    public async Task<HttpResponseMessage> ConfirmFromEmailAsync(string email)
    {
        var query = QueryHelpers.ParseQuery(Emails.LatestLink(email, "Confirm").Query);
        return await PostAsync("/api/auth/confirm-email", new { userId = query["userId"].ToString(), token = query["token"].ToString() });
    }

    public async Task<HttpResponseMessage> LoginAsync(string email, string password = Password)
    {
        var response = await PostAsync("/api/auth/login", new { email, password });
        if (response.IsSuccessStatusCode)
        {
            await RefreshAntiforgeryAsync();
        }

        return response;
    }

    /// <summary>The raw Set-Cookie header for <paramref name="name"/>, attributes included.</summary>
    public static string? FindSetCookie(HttpResponseMessage response, string name) =>
        response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.FirstOrDefault(v => v.StartsWith(name + "=", StringComparison.Ordinal))
            : null;

    public static string NewEmail() => $"parent-{Guid.NewGuid():N}@example.test";

    public void Dispose() => Client.Dispose();

    private static string? FindCookie(HttpResponseMessage response, string name)
    {
        var header = FindSetCookie(response, name);
        return header is null ? null : Uri.UnescapeDataString(header[(name.Length + 1)..].Split(';')[0]);
    }
}
