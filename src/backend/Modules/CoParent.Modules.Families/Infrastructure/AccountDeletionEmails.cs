using CoParent.Infrastructure.Email;
using Microsoft.Extensions.Logging;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// Emails sent when a parent deletes their account (A-12): a confirmation to them, and a neutral notice to each
/// co-parent that names nobody (owner decision, October 20, 2026).
/// </summary>
internal sealed partial class AccountDeletionEmails(IEmailSender sender, PublicUrls urls, ILogger<AccountDeletionEmails> logger)
{
    public Task SendDeletedAsync(string to, CancellationToken cancellationToken) =>
        SendAsync(to, new EmailContent(
            "Your Parenthesis account has been deleted",
            "Your account and personal details are gone",
            null,
            [
                "Your Parenthesis account has been deleted, as you asked. Your sign-in, name and private details are gone, and you've been signed out everywhere.",
                "If you shared a family with a co-parent, the family, children and shared history stay with them. Anything you added there now shows as \"Former parent\".",
            ],
            new EmailAction("Visit Parenthesis", urls.Build("/", new Dictionary<string, string?>())),
            "You're welcome back any time: you can sign up again with this email address."), cancellationToken);

    public Task SendParentLeftAsync(string to, CancellationToken cancellationToken) =>
        SendAsync(to, new EmailContent(
            "A parent has left your family on Parenthesis",
            "Your family, children and shared history are unchanged",
            null,
            [
                "A parent has left your family on Parenthesis. Your family, children and shared history are unchanged.",
                "Anything they added now shows as \"Former parent\". Requests they were still waiting on were withdrawn.",
            ],
            new EmailAction("Open Parenthesis", urls.Build("/", new Dictionary<string, string?>())),
            "You can invite a co-parent again from Settings whenever you're ready."), cancellationToken);

    private async Task SendAsync(string to, EmailContent content, CancellationToken cancellationToken)
    {
        try
        {
            await sender.SendAsync(EmailTemplate.Render(to, content), cancellationToken);
        }
#pragma warning disable CA1031 // Delivery failures are logged; the deletion itself is already complete.
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogSendFailed(exception, content.Subject);
        }
    }

    // The subject only: never the address (no personal data in logs).
    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to send an account-deletion email: {Subject}")]
    private partial void LogSendFailed(Exception exception, string subject);
}
