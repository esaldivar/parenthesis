using System.Globalization;
using CoParent.Infrastructure.Email;
using Microsoft.Extensions.Logging;
using NodaTime;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// The four shared-device PIN notifications (#153; approved email concepts, built on the existing branded template):
/// parent PIN paused, parent PIN locked, a child's PIN locked, and a child's PIN reset. None of them ever contains a
/// PIN or a sign-in token, and the email itself grants nothing: every link opens a page that needs the parent's own
/// sign-in. Names stay out of subjects and previews. Each message goes to one recipient, never CC or BCC.
/// <para>
/// A send that fails is logged without addresses and reported as false, so the app never claims an email was sent
/// when it wasn't. The PIN change itself is already saved either way. SMTP acceptance doesn't prove inbox delivery.
/// </para>
/// </summary>
internal sealed partial class PinSafetyEmails(IEmailSender sender, PublicUrls urls, ILogger<PinSafetyEmails> logger)
{
    /// <summary>Three wrong parent PINs: to that parent only. Returns whether the email was handed to the mail server.</summary>
    public Task<bool> SendParentPausedAsync(
        string to, string parentName, DateTimeOffset retryAt, string timeZone, CancellationToken cancellationToken) =>
        TrySendAsync(to, new EmailContent(
            "Your parent PIN is paused",
            "You can retry after the pause or reset your PIN",
            parentName,
            [
                "Someone entered the wrong parent PIN for your profile three times on a shared family device, so we've paused your parent PIN for 10 minutes.",
                $"You can try again after {FormatTime(retryAt, timeZone)}.",
                "If you've forgotten your PIN, sign in with your email and password, then choose a new PIN in Settings. Your account and password aren't affected.",
            ],
            new EmailAction("Reset PIN", SettingsLink()),
            "You're getting this because your parent PIN was paused. We never send PINs by email."), cancellationToken);

    /// <summary>Three more wrong parent PINs after a pause: to that parent only.</summary>
    public Task<bool> SendParentLockedAsync(string to, string parentName, CancellationToken cancellationToken) =>
        TrySendAsync(to, new EmailContent(
            "Your parent PIN is locked",
            "Reset your PIN to use your parent profile",
            parentName,
            [
                "Your parent PIN was entered incorrectly three more times after a pause, so it's locked until you choose a new one.",
                "Your account and password aren't locked. Sign in with your email and password, then choose a new PIN in Settings. Other profiles on the device still work.",
                "If you've also forgotten your password, use \"Forgot your password?\" on the sign-in page first.",
            ],
            new EmailAction("Reset PIN", SettingsLink()),
            "If you didn't try to use your parent PIN, someone else may have. You can remove a lost device in Settings. We never send PINs by email."),
            cancellationToken);

    /// <summary>A child's PIN needs a reset: to each currently authorized parent, separately. Returns how many were sent.</summary>
    public async Task<int> SendChildLockedAsync(
        IReadOnlyCollection<(string Email, string Name)> parents, string childName, CancellationToken cancellationToken)
    {
        var sent = 0;
        foreach (var (email, name) in parents)
        {
            var ok = await TrySendAsync(email, new EmailContent(
                "A child's PIN is locked",
                "Sign in to help reset the PIN",
                name,
                [
                    $"{childName}'s PIN was entered incorrectly too many times, so it's locked until a parent chooses a new one.",
                    "Either parent can reset it: sign in with your own email and password, then go to Settings. Other profiles on the device still work.",
                ],
                new EmailAction("Sign in", SettingsLink()),
                "You're getting this because you're a parent in this family on Parenthesis. We never send PINs by email."),
                cancellationToken);
            sent += ok ? 1 : 0;
        }

        return sent;
    }

    /// <summary>After a parent resets a child's PIN: to the other currently authorized parent(s) only, without the PIN.</summary>
    public async Task SendChildPinResetAsync(
        IReadOnlyCollection<(string Email, string Name)> otherParents, string actorName, string childName, CancellationToken cancellationToken)
    {
        foreach (var (email, name) in otherParents)
        {
            await TrySendAsync(email, new EmailContent(
                "A child's PIN was reset",
                "A parent updated a child's PIN",
                name,
                [
                    $"{actorName} set a new PIN for {childName}. Any pause or lock on {childName}'s PIN has been cleared.",
                    "For privacy, the new PIN isn't included in this email.",
                ],
                new EmailAction("View account", SettingsLink()),
                "You're getting this because you're a parent in this family on Parenthesis."), cancellationToken);
        }
    }

    /// <summary>"4:35 PM on November 2, 2026 (America/Chicago)": an absolute time in the family's time zone.</summary>
    internal static string FormatTime(DateTimeOffset at, string timeZone)
    {
        var zone = DateTimeZoneProviders.Tzdb.GetZoneOrNull(timeZone) ?? DateTimeZone.Utc;
        var local = Instant.FromDateTimeOffset(at).InZone(zone);
        return local.ToString("h:mm tt 'on' MMMM d, yyyy", CultureInfo.InvariantCulture) + $" ({zone.Id})";
    }

    private Uri SettingsLink() => urls.Build("/settings", new Dictionary<string, string?>());

    private async Task<bool> TrySendAsync(string to, EmailContent content, CancellationToken cancellationToken)
    {
        try
        {
            await sender.SendAsync(EmailTemplate.Render(to, content), cancellationToken);
            return true;
        }
#pragma warning disable CA1031 // Delivery failures are logged; the PIN change is already saved and shown in the app.
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogSendFailed(exception, content.Subject);
            return false;
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to send PIN notification '{Subject}'")]
    private partial void LogSendFailed(Exception exception, string subject);
}
