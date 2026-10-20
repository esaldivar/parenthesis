using System.Text;
using System.Text.Encodings.Web;

namespace CoParent.Infrastructure.Email;

/// <summary>The one button in an email, and where it goes.</summary>
public sealed record EmailAction(string Label, Uri Url);

/// <summary>
/// What an email says. Every value is plain text: the template encodes it, so names and family names typed by users
/// can't inject markup.
/// </summary>
/// <param name="Subject">The subject line.</param>
/// <param name="Preview">The short line inboxes show next to the subject. Never put links or personal details here.</param>
/// <param name="Greeting">"Hi Sam," or null for a plain "Hi,".</param>
/// <param name="Paragraphs">The message, one entry per paragraph.</param>
/// <param name="Action">The single call to action. It's the only link in the email.</param>
/// <param name="Footer">Why the person got this email and what to do if they didn't expect it.</param>
public sealed record EmailContent(
    string Subject,
    string Preview,
    string? Greeting,
    IReadOnlyList<string> Paragraphs,
    EmailAction Action,
    string Footer);

/// <summary>
/// Renders every Parenthesis email the same way: an HTML version (table layout and inline styles, so it holds up in
/// Gmail, Outlook and Apple Mail, with the design system's colors) and a plain-text version with the same words and
/// the same single link. No images, so nothing is blocked or tracked, and the brand mark isn't approximated.
/// </summary>
public static class EmailTemplate
{
    // Light-theme tokens from docs/design-system.md. Dark-mode email clients invert these themselves.
    private const string Canvas = "#F7F5ED";
    private const string Surface = "#FFFFFF";
    private const string TextPrimary = "#203A31";
    private const string TextSecondary = "#4D6258";
    private const string Action = "#176B67";
    private const string OnAction = "#FFFFFF";
    private const string Border = "#E4EBDD";
    private const string FontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

    public static EmailMessage Render(string to, EmailContent content)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(to);
        ArgumentNullException.ThrowIfNull(content);
        return new EmailMessage(to, content.Subject, RenderText(content), RenderHtml(content));
    }

    private static string Hello(EmailContent content) =>
        string.IsNullOrWhiteSpace(content.Greeting) ? "Hi," : $"Hi {content.Greeting.Trim()},";

    private static string RenderText(EmailContent content)
    {
        var text = new StringBuilder();
        text.Append(Hello(content)).Append("\n\n");
        foreach (var paragraph in content.Paragraphs)
        {
            text.Append(paragraph).Append("\n\n");
        }

        text.Append(content.Action.Label).Append(": ").Append(content.Action.Url.AbsoluteUri).Append("\n\n");
        text.Append(content.Footer).Append("\n\n");
        text.Append("Parenthesis\n");
        return text.ToString();
    }

    private static string RenderHtml(EmailContent content)
    {
        var e = HtmlEncoder.Default;
        var url = e.Encode(content.Action.Url.AbsoluteUri);
        var paragraphs = new StringBuilder();
        foreach (var paragraph in content.Paragraphs)
        {
            paragraphs.Append(
                $"""<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:{TextPrimary};">{e.Encode(paragraph)}</p>""");
        }

        return $"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="color-scheme" content="light dark">
            <meta name="supported-color-schemes" content="light dark">
            <title>{e.Encode(content.Subject)}</title>
            </head>
            <body style="margin:0;padding:0;background-color:{Canvas};">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{e.Encode(content.Preview)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{Canvas};">
            <tr><td align="center" style="padding:24px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:{FontStack};">
            <tr><td style="padding:0 4px 16px;font-size:20px;font-weight:600;line-height:1.3;color:{TextPrimary};">Parenthesis</td></tr>
            <tr><td style="background-color:{Surface};border:1px solid {Border};border-radius:12px;padding:32px 24px;">
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:{TextPrimary};">{e.Encode(Hello(content))}</p>
            {paragraphs}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
            <tr><td style="border-radius:8px;background-color:{Action};">
            <a href="{url}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;line-height:1.25;color:{OnAction};text-decoration:none;border-radius:8px;">{e.Encode(content.Action.Label)}</a>
            </td></tr>
            </table>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:{TextSecondary};">If the button doesn't work, copy this link into your browser:</p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.5;word-break:break-all;"><a href="{url}" style="color:{Action};">{url}</a></p>
            <p style="margin:0;font-size:14px;line-height:1.5;color:{TextSecondary};">{e.Encode(content.Footer)}</p>
            </td></tr>
            <tr><td style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:{TextSecondary};">Parenthesis, a shared space for co-parents. This is an automatic message, so replies aren't read.</td></tr>
            </table>
            </td></tr>
            </table>
            </body>
            </html>
            """;
    }
}
