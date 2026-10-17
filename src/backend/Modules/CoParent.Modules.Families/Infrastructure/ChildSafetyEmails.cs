using System.Text.Encodings.Web;
using CoParent.Infrastructure.Email;
using Microsoft.Extensions.Logging;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>Tells both parents when a child's profile locks after three wrong PINs (ADR-0006).</summary>
internal sealed partial class ChildSafetyEmails(IEmailSender sender, PublicUrls urls, ILogger<ChildSafetyEmails> logger)
{
    public async Task SendLockedAsync(
        IReadOnlyCollection<string> parentEmails, string childName, string deviceName, CancellationToken cancellationToken)
    {
        var link = urls.Build("/child-essentials", new Dictionary<string, string?>());
        var intro = $"{childName}'s profile was locked after 3 wrong PINs on \"{deviceName}\". "
            + "Either parent can unlock it from Parenthesis.";
        const string footer = "If this wasn't your child, you can also remove the device from your family's device list.";
        var html = HtmlEncoder.Default;
        foreach (var to in parentEmails)
        {
            var message = new EmailMessage(
                to,
                $"{childName}'s profile is locked",
                $"""
                Hi,

                {intro}

                Open Parenthesis: {link}

                {footer}
                """,
                $"""
                <p>Hi,</p>
                <p>{html.Encode(intro)}</p>
                <p><a href="{html.Encode(link.AbsoluteUri)}">Open Parenthesis</a></p>
                <p>{html.Encode(footer)}</p>
                """);
            try
            {
                await sender.SendAsync(message, cancellationToken);
            }
#pragma warning disable CA1031 // Delivery failures are logged; the lock itself is already saved and visible in the app.
            catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
            {
                LogSendFailed(exception);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to send a child-locked notification")]
    private partial void LogSendFailed(Exception exception);
}
