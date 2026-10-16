using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace CoParent.Infrastructure.Email;

public sealed record EmailMessage(string To, string Subject, string TextBody, string HtmlBody);

/// <summary>Sends transactional email. SMTP for now (Mailpit locally); Azure Communication Services later (S-03).</summary>
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default);
}

public sealed class EmailOptions
{
    public const string Section = "Email";

    public string FromAddress { get; set; } = "no-reply@parenthesis.local";

    public string FromName { get; set; } = "Parenthesis";

    public SmtpOptions Smtp { get; set; } = new();

    public sealed class SmtpOptions
    {
        public string? Host { get; set; }

        public int Port { get; set; } = 587;

        /// <summary>STARTTLS. Only local catch-all servers such as Mailpit should turn this off.</summary>
        public bool UseStartTls { get; set; } = true;

        public string? Username { get; set; }

        public string? Password { get; set; }
    }
}

internal sealed class SmtpEmailSender(IOptions<EmailOptions> options) : IEmailSender
{
    public async Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(message);
        var settings = options.Value;
        var smtp = settings.Smtp;
        if (string.IsNullOrWhiteSpace(smtp.Host))
        {
            throw new InvalidOperationException($"{EmailOptions.Section}:Smtp:Host is not configured.");
        }

        using var mime = new MimeMessage();
        mime.From.Add(new MailboxAddress(settings.FromName, settings.FromAddress));
        mime.To.Add(MailboxAddress.Parse(message.To));
        mime.Subject = message.Subject;
        mime.Body = new BodyBuilder { TextBody = message.TextBody, HtmlBody = message.HtmlBody }.ToMessageBody();

        using var client = new SmtpClient();
        await client.ConnectAsync(
            smtp.Host, smtp.Port, smtp.UseStartTls ? SecureSocketOptions.StartTls : SecureSocketOptions.None, cancellationToken);
        if (!string.IsNullOrEmpty(smtp.Username))
        {
            await client.AuthenticateAsync(smtp.Username, smtp.Password ?? string.Empty, cancellationToken);
        }

        await client.SendAsync(mime, cancellationToken);
        await client.DisconnectAsync(quit: true, cancellationToken);
    }
}
