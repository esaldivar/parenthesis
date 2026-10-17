using System.Text.Encodings.Web;
using CoParent.Infrastructure.Email;
using Microsoft.Extensions.Logging;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// The co-parent invitation email. The wording depends on whether the invitee already has an account ("join" vs
/// "sign up to join"). Only the invitee sees which, never the inviter (ADR-0006).
/// </summary>
internal sealed partial class InvitationEmails(IEmailSender sender, PublicUrls urls, ILogger<InvitationEmails> logger)
{
    public Task SendAsync(
        string to, string inviterName, string familyName, string token, bool hasAccount, CancellationToken cancellationToken)
    {
        var query = new Dictionary<string, string?> { ["token"] = token };
        var (subject, intro, label, link) = hasAccount
            ? ($"{inviterName} invited you to join {familyName} on Parenthesis",
                $"{inviterName} invited you to join {familyName} as a co-parent. Sign in to accept.",
                "Join the family",
                urls.Build("/invitations/accept", query))
            : ($"{inviterName} invited you to Parenthesis",
                $"{inviterName} invited you to join {familyName} on Parenthesis, a shared space for co-parents. Create your account to accept.",
                "Sign up to join",
                urls.Build("/register", query));

        const string footer =
            "The invitation expires in 7 days and works once. If you weren't expecting it, you can ignore this email.";
        var html = HtmlEncoder.Default;
        var message = new EmailMessage(
            to,
            subject,
            $"""
            Hi,

            {intro}

            {label}: {link}

            {footer}
            """,
            $"""
            <p>Hi,</p>
            <p>{html.Encode(intro)}</p>
            <p><a href="{html.Encode(link.AbsoluteUri)}">{html.Encode(label)}</a></p>
            <p>{html.Encode(footer)}</p>
            """);
        return TrySendAsync(message, cancellationToken);
    }

    private async Task TrySendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        try
        {
            await sender.SendAsync(message, cancellationToken);
        }
#pragma warning disable CA1031 // Any delivery failure is logged; the parent can send the invitation again.
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogSendFailed(exception);
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to send a co-parent invitation email")]
    private partial void LogSendFailed(Exception exception);
}
