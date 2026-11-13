using MimeKit;

namespace CoParent.Infrastructure.Email;

/// <summary>Turns an <see cref="EmailMessage"/> into the MIME message that's sent, with the inline brand icon.</summary>
public static class EmailMime
{
    private const string LogoResource = "CoParent.Infrastructure.Email.parenthesis-icon.png";

    private static readonly Lazy<byte[]> _logo = new(() =>
    {
        using var stream = typeof(EmailMime).Assembly.GetManifestResourceStream(LogoResource)
            ?? throw new InvalidOperationException($"Embedded resource '{LogoResource}' is missing.");
        using var copy = new MemoryStream();
        stream.CopyTo(copy);
        return copy.ToArray();
    });

    public static MimeMessage Build(EmailOptions settings, EmailMessage message)
    {
        ArgumentNullException.ThrowIfNull(settings);
        ArgumentNullException.ThrowIfNull(message);

        var mime = new MimeMessage();
        mime.From.Add(new MailboxAddress(settings.FromName, settings.FromAddress));
        mime.To.Add(MailboxAddress.Parse(message.To));
        mime.Subject = message.Subject;

        var body = new BodyBuilder { TextBody = message.TextBody, HtmlBody = message.HtmlBody };
        if (message.HtmlBody.Contains($"cid:{EmailTemplate.LogoContentId}", StringComparison.Ordinal))
        {
            var logo = body.LinkedResources.Add("parenthesis-icon.png", _logo.Value, new ContentType("image", "png"));
            logo.ContentId = EmailTemplate.LogoContentId;
        }

        mime.Body = body.ToMessageBody();
        return mime;
    }
}
