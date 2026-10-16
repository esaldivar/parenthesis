using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace CoParent.IntegrationTests.Api;

[Collection(ApiCollectionDefinition.Name)]
public sealed class AuthTests(ApiFactory api) : IAsyncLifetime
{
    private ApiSession _session = null!;

    public async ValueTask InitializeAsync()
    {
        await api.ResetDatabaseAsync();
        _session = await ApiSession.StartAsync(api);
    }

    public ValueTask DisposeAsync()
    {
        _session.Dispose();
        return ValueTask.CompletedTask;
    }

    [Fact]
    public async Task Register_then_login_starts_a_session_for_that_user()
    {
        var email = ApiSession.NewEmail();

        Assert.Equal(HttpStatusCode.Accepted, (await _session.RegisterAsync(email, displayName: "Alex Rivera")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _session.LoginAsync(email)).StatusCode);

        var me = await _session.GetAsync("/api/me");
        var body = await me.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        Assert.Equal(email, body.GetProperty("email").GetString());
        Assert.Equal("Alex Rivera", body.GetProperty("displayName").GetString());
        Assert.Equal(7, body.GetProperty("id").GetGuid().Version);
    }

    [Fact]
    public async Task Session_cookie_is_host_prefixed_secure_httponly_and_samesite_strict()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterAsync(email);

        var login = await _session.PostAsync("/api/auth/login", new { email, password = ApiSession.Password });
        var cookie = ApiSession.FindSetCookie(login, "__Host-parenthesis")?.ToLowerInvariant();

        Assert.NotNull(cookie);
        Assert.Contains("secure", cookie, StringComparison.Ordinal);
        Assert.Contains("httponly", cookie, StringComparison.Ordinal);
        Assert.Contains("samesite=strict", cookie, StringComparison.Ordinal);
        Assert.Contains("path=/", cookie, StringComparison.Ordinal);
        Assert.DoesNotContain("domain=", cookie, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Registering_an_existing_email_looks_the_same_as_success()
    {
        var email = ApiSession.NewEmail();

        var first = await _session.RegisterAsync(email);
        var second = await _session.RegisterAsync(email, displayName: "Someone Else");

        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);
        Assert.Equal(first.StatusCode, second.StatusCode);
        Assert.Equal(
            await first.Content.ReadAsStringAsync(TestContext.Current.CancellationToken),
            await second.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Short_password_is_rejected_with_a_validation_problem()
    {
        var response = await _session.RegisterAsync(ApiSession.NewEmail(), password: "too-short");
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(problem.GetProperty("errors").TryGetProperty("password", out _));
    }

    [Fact]
    public async Task Wrong_password_and_unknown_email_get_the_same_401()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterAsync(email);

        var wrongPassword = await _session.LoginAsync(email, "not the right password");
        var unknownEmail = await _session.LoginAsync(ApiSession.NewEmail());

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.StatusCode);
        Assert.Equal(await TitleAsync(wrongPassword), await TitleAsync(unknownEmail));
    }

    [Fact]
    public async Task Account_locks_after_five_failed_attempts()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterAsync(email);

        for (var attempt = 0; attempt < 5; attempt++)
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await _session.LoginAsync(email, "wrong password!!")).StatusCode);
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await _session.LoginAsync(email)).StatusCode);
    }

    [Fact]
    public async Task Logout_ends_the_session()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterAsync(email);
        await _session.LoginAsync(email);

        Assert.Equal(HttpStatusCode.NoContent, (await _session.PostAsync("/api/auth/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _session.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Me_without_a_session_returns_401_problem_not_a_redirect()
    {
        var response = await _session.GetAsync("/api/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Unsafe_request_without_antiforgery_token_is_rejected()
    {
        var response = await _session.PostAsync(
            "/api/auth/register",
            new { email = ApiSession.NewEmail(), password = ApiSession.Password, displayName = "Alex" },
            withAntiforgery: false);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Invalid or missing antiforgery token.", await TitleAsync(response));
    }

    [Fact]
    public async Task Login_is_rate_limited_per_client()
    {
        await using var limited = api.WithWebHostBuilder(b => b.UseSetting("Identity:AuthRateLimit:PermitLimit", "2"));
        using var session = await ApiSession.StartAsync(limited);
        var email = ApiSession.NewEmail();

        var statuses = new List<HttpStatusCode>();
        for (var attempt = 0; attempt < 3; attempt++)
        {
            statuses.Add((await session.LoginAsync(email, "wrong password!!")).StatusCode);
        }

        Assert.Equal([HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests], statuses);
    }

    private static async Task<string?> TitleAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken))
            .GetProperty("title").GetString();
}
