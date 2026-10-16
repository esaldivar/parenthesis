using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace CoParent.IntegrationTests.Api;

[Collection(ApiCollectionDefinition.Name)]
public sealed class EmailFlowTests(ApiFactory api) : IAsyncLifetime
{
    private const string NewPassword = "a brand new long passphrase";

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
    public async Task Sign_in_is_refused_until_the_email_is_confirmed()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterAsync(email);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _session.LoginAsync(email)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _session.ConfirmFromEmailAsync(email)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _session.LoginAsync(email)).StatusCode);
    }

    [Fact]
    public async Task Confirmation_with_a_tampered_token_is_rejected()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterAsync(email);
        var query = QueryHelpers.ParseQuery(_session.Emails.LatestLink(email, "Confirm").Query);

        var response = await _session.PostAsync("/api/auth/confirm-email", new { userId = query["userId"].ToString(), token = "AAAA" + query["token"] });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("This link is invalid or has expired.", await TitleAsync(response));
        Assert.Equal(HttpStatusCode.Unauthorized, (await _session.LoginAsync(email)).StatusCode);
    }

    [Fact]
    public async Task Registering_an_existing_email_notifies_the_owner_and_not_the_caller()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterConfirmedAsync(email);

        var response = await _session.RegisterAsync(email, displayName: "Someone Else");

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal(
            ["Confirm your email for Parenthesis", "You already have a Parenthesis account"],
            _session.Emails.SentTo(email).Select(m => m.Subject));
    }

    [Fact]
    public async Task Resend_confirmation_answers_202_and_only_emails_unconfirmed_accounts()
    {
        var unconfirmed = ApiSession.NewEmail();
        var confirmed = ApiSession.NewEmail();
        var unknown = ApiSession.NewEmail();
        await _session.RegisterAsync(unconfirmed);
        await _session.RegisterConfirmedAsync(confirmed);

        foreach (var email in new[] { unconfirmed, confirmed, unknown })
        {
            Assert.Equal(HttpStatusCode.Accepted, (await _session.PostAsync("/api/auth/resend-confirmation", new { email })).StatusCode);
        }

        Assert.Equal(2, _session.Emails.SentTo(unconfirmed).Count);
        Assert.Single(_session.Emails.SentTo(confirmed));
        Assert.Empty(_session.Emails.SentTo(unknown));
    }

    [Fact]
    public async Task Password_reset_changes_the_password_and_the_link_works_once()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterConfirmedAsync(email);

        Assert.Equal(HttpStatusCode.Accepted, (await _session.PostAsync("/api/auth/forgot-password", new { email })).StatusCode);
        var token = QueryHelpers.ParseQuery(_session.Emails.LatestLink(email, "Reset").Query)["token"].ToString();

        var reset = await _session.PostAsync("/api/auth/reset-password", new { email, token, password = NewPassword });
        var reused = await _session.PostAsync("/api/auth/reset-password", new { email, token, password = "yet another long passphrase" });

        Assert.Equal(HttpStatusCode.NoContent, reset.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, reused.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _session.LoginAsync(email)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _session.LoginAsync(email, NewPassword)).StatusCode);
    }

    [Fact]
    public async Task Password_reset_unlocks_a_locked_out_account()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterConfirmedAsync(email);
        for (var attempt = 0; attempt < 5; attempt++)
        {
            await _session.LoginAsync(email, "wrong password!!");
        }

        await _session.PostAsync("/api/auth/forgot-password", new { email });
        var token = QueryHelpers.ParseQuery(_session.Emails.LatestLink(email, "Reset").Query)["token"].ToString();
        await _session.PostAsync("/api/auth/reset-password", new { email, token, password = NewPassword });

        Assert.Equal(HttpStatusCode.NoContent, (await _session.LoginAsync(email, NewPassword)).StatusCode);
    }

    [Fact]
    public async Task Forgot_password_for_an_unknown_email_answers_202_and_sends_nothing()
    {
        var email = ApiSession.NewEmail();

        var response = await _session.PostAsync("/api/auth/forgot-password", new { email });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Empty(_session.Emails.SentTo(email));
    }

    [Fact]
    public async Task Email_links_use_the_configured_base_url_not_the_request_host()
    {
        var email = ApiSession.NewEmail();
        await _session.RegisterConfirmedAsync(email);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/forgot-password")
        {
            Content = JsonContent.Create(new { email }),
        };
        request.Headers.Host = "evil.example";
        await _session.Client.SendAsync(request, TestContext.Current.CancellationToken);
        await _session.PostAsync("/api/auth/forgot-password", new { email });

        var link = _session.Emails.LatestLink(email, "Reset");

        Assert.Equal(new Uri(ApiFactory.PublicBaseUrl).Host, link.Host);
        Assert.Equal("/reset-password", link.AbsolutePath);
        Assert.All(_session.Emails.SentTo(email), m => Assert.DoesNotContain("evil.example", m.TextBody, StringComparison.Ordinal));
    }

    [Fact]
    public async Task Email_html_encodes_the_display_name()
    {
        var email = ApiSession.NewEmail();

        await _session.RegisterAsync(email, displayName: "<script>alert(1)</script>");

        var html = Assert.Single(_session.Emails.SentTo(email)).HtmlBody;
        Assert.DoesNotContain("<script>", html, StringComparison.Ordinal);
        Assert.Contains("&lt;script&gt;", html, StringComparison.Ordinal);
    }

    private static async Task<string?> TitleAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken))
            .GetProperty("title").GetString();
}
