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
/// the same single link.
/// <para>
/// The header is the brand as the app shows it (docs/design/BRANDING.md): the approved icon export, unchanged and
/// attached inline (<see cref="LogoContentId"/>, so nothing is fetched or tracked), next to the Option B wordmark as
/// text. The full horizontal lockup isn't used because its exports are still pending.
/// </para>
/// </summary>
public static class EmailTemplate
{
    /// <summary>Content-ID of the inline icon. <see cref="EmailMime"/> attaches it to every message that references it.</summary>
    public const string LogoContentId = "parenthesis-icon";

    // Light-theme tokens from docs/design-system.md, inline so every client gets them. Clients that support
    // prefers-color-scheme (Apple Mail, Outlook for Mac and iOS) switch to the dark tokens in DarkModeCss.
    private const string Canvas = "#F7F5ED";
    private const string Surface = "#FFFFFF";
    private const string TextPrimary = "#203A31";
    private const string TextSecondary = "#4D6258";
    private const string Action = "#176B67";
    private const string OnAction = "#FFFFFF";
    private const string Border = "#E4EBDD";
    private const string WordmarkParent = "#5E8F7E";
    private const string WordmarkHesis = "#20303F";

    // Dark-theme tokens from docs/design-system.md; "hesis" turns ivory on dark surfaces (BRANDING.md).
    private const string DarkModeCss = """
        @media (prefers-color-scheme: dark) {
          .pt-canvas { background-color: #10251E !important; }
          .pt-surface { background-color: #19372D !important; border-color: #24483A !important; }
          .pt-text, .pt-hesis { color: #F7F5ED !important; }
          .pt-muted { color: #C0D0C5 !important; }
          .pt-btn { background-color: #91D2C5 !important; }
          .pt-btn-text { color: #10251E !important; }
          .pt-link { color: #91D2C5 !important; }
        }
        """;
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
                $"""<p class="pt-text" style="margin:0 0 16px;font-size:16px;line-height:1.5;color:{TextPrimary};">{e.Encode(paragraph)}</p>""");
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
            <style>{DarkModeCss}</style>
            </head>
            <body class="pt-canvas" style="margin:0;padding:0;background-color:{Canvas};">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{e.Encode(content.Preview)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="pt-canvas" style="background-color:{Canvas};">
            <tr><td align="center" style="padding:24px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:{FontStack};">
            <tr><td style="padding:0 4px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:8px;vertical-align:middle;"><img src="cid:{LogoContentId}" width="43" height="40" alt="" style="display:block;border:0;width:43px;height:40px;"></td>
            <td style="vertical-align:middle;font-size:22px;font-weight:700;line-height:1;"><span style="color:{WordmarkParent};">Parent</span><span class="pt-hesis" style="color:{WordmarkHesis};">hesis</span></td>
            </tr></table>
            </td></tr>
            <tr><td class="pt-surface" style="background-color:{Surface};border:1px solid {Border};border-radius:12px;padding:32px 24px;">
            <p class="pt-text" style="margin:0 0 16px;font-size:16px;line-height:1.5;color:{TextPrimary};">{e.Encode(Hello(content))}</p>
            {paragraphs}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
            <tr><td class="pt-btn" style="border-radius:8px;background-color:{Action};">
            <a href="{url}" class="pt-btn-text" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:600;line-height:1.25;color:{OnAction};text-decoration:none;border-radius:8px;">{e.Encode(content.Action.Label)}</a>
            </td></tr>
            </table>
            <p class="pt-muted" style="margin:0 0 8px;font-size:14px;line-height:1.5;color:{TextSecondary};">If the button doesn't work, copy this link into your browser:</p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.5;word-break:break-all;"><a href="{url}" class="pt-link" style="color:{Action};">{url}</a></p>
            <p class="pt-muted" style="margin:0;font-size:14px;line-height:1.5;color:{TextSecondary};">{e.Encode(content.Footer)}</p>
            </td></tr>
            <tr><td class="pt-muted" style="padding:16px 4px 0;font-size:12px;line-height:1.5;color:{TextSecondary};">Parenthesis, a shared space for co-parents. This is an automatic message, so replies aren't read.</td></tr>
            </table>
            </td></tr>
            </table>
            </body>
            </html>
            """;
    }
}
