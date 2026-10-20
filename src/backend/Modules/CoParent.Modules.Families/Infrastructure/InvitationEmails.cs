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
        var content = hasAccount
            ? new EmailContent(
                $"{inviterName} invited you to join {familyName} on Parenthesis",
                "Accept to become a member of the family",
                null,
                [
                    $"{inviterName} invited you to join {familyName} as a co-parent.",
                    "You already have a Parenthesis account, so sign in with this email address and accept the invitation to become a member. Your existing family and data stay as they are: families are never merged.",
                ],
                new EmailAction("Accept and join", urls.Build("/invitations/accept", query)),
                Footer)
            : new EmailContent(
                $"{inviterName} invited you to Parenthesis",
                "Create your account to join the family",
                null,
                [
                    $"{inviterName} invited you to join {familyName} on Parenthesis, a shared space for co-parents.",
                    "Create your account with this email address to accept. Both parents have an equal say in the family.",
                ],
                new EmailAction("Sign up to join", urls.Build("/register", query)),
                Footer);

        return TrySendAsync(EmailTemplate.Render(to, content), cancellationToken);
    }

    private const string Footer =
        "The invitation expires in 7 days and works once. If you weren't expecting it, you can ignore this email.";

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
