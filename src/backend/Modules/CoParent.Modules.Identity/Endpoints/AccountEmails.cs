using System.Text;
using System.Text.Encodings.Web;
using CoParent.Infrastructure.Email;
using CoParent.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging;

namespace CoParent.Modules.Identity.Endpoints;

/// <summary>
/// Account emails. A failed send is logged and swallowed: the account change already happened, and the user can
/// ask for the email again. (A transactional outbox replaces this in F-09.) Logs never include email addresses.
/// </summary>
internal sealed partial class AccountEmails(
    UserManager<AppUser> users, IEmailSender sender, PublicUrls urls, ILogger<AccountEmails> logger)
{
    public async Task SendConfirmationAsync(AppUser user, CancellationToken cancellationToken)
    {
        var token = Encode(await users.GenerateEmailConfirmationTokenAsync(user));
        var link = urls.Build("/confirm-email", new Dictionary<string, string?>
        {
            ["userId"] = user.Id.ToString(),
            ["token"] = token,
        });

        await TrySendAsync(Compose(
            user,
            "Confirm your email for Parenthesis",
            "Confirm your email address to finish setting up your Parenthesis account.",
            ("Confirm email", link),
            "If you didn't create an account, you can ignore this email."), cancellationToken);
    }

    /// <summary>Sent when someone registers with an email that already has an account. Only the inbox owner learns that.</summary>
    public async Task SendAlreadyRegisteredAsync(AppUser user, CancellationToken cancellationToken)
    {
        var link = urls.Build("/forgot-password", new Dictionary<string, string?>());

        await TrySendAsync(Compose(
            user,
            "You already have a Parenthesis account",
            "Someone tried to create a Parenthesis account with this email address, which already has one. If it was you, sign in, or reset your password if you've forgotten it.",
            ("Reset password", link),
            "If it wasn't you, no action is needed. Your account hasn't changed."), cancellationToken);
    }

    public async Task SendPasswordResetAsync(AppUser user, CancellationToken cancellationToken)
    {
        var token = Encode(await users.GeneratePasswordResetTokenAsync(user));
        var link = urls.Build("/reset-password", new Dictionary<string, string?>
        {
            ["email"] = user.Email,
            ["token"] = token,
        });

        await TrySendAsync(Compose(
            user,
            "Reset your Parenthesis password",
            "We received a request to reset your password. The link works once.",
            ("Choose a new password", link),
            "If you didn't ask for this, you can ignore this email. Your password won't change."), cancellationToken);
    }

    /// <summary>Identity tokens contain characters that aren't URL-safe, so links carry them base64url-encoded.</summary>
    public static string Encode(string token) => WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

    public static string? Decode(string? token)
    {
        if (string.IsNullOrEmpty(token))
        {
            return null;
        }

        try
        {
            return Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private static EmailMessage Compose(AppUser user, string subject, string intro, (string Label, Uri Url) action, string footer)
    {
        var html = HtmlEncoder.Default;
        var text = $"""
            Hi {user.DisplayName},

            {intro}

            {action.Label}: {action.Url}

            {footer}
            """;
        var body = $"""
            <p>Hi {html.Encode(user.DisplayName)},</p>
            <p>{html.Encode(intro)}</p>
            <p><a href="{html.Encode(action.Url.AbsoluteUri)}">{html.Encode(action.Label)}</a></p>
            <p>{html.Encode(footer)}</p>
            """;
        return new EmailMessage(user.Email!, subject, text, body);
    }

    private async Task TrySendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        try
        {
            await sender.SendAsync(message, cancellationToken);
        }
#pragma warning disable CA1031 // Any delivery failure is logged; the user can request the email again.
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogSendFailed(exception, message.Subject);
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to send account email '{Subject}'")]
    private partial void LogSendFailed(Exception exception, string subject);
}
