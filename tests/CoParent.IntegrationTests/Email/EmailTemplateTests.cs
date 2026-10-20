using System.Text.RegularExpressions;
using CoParent.Infrastructure.Email;

namespace CoParent.IntegrationTests.Email;

public partial class EmailTemplateTests
{
    private static readonly Uri _link = new("https://app.example.test/confirm-email?userId=1&token=abc");

    private static EmailContent Content(string? greeting = "Sam", string paragraph = "Confirm your email address.") =>
        new("Confirm your email", "One step left", greeting, [paragraph], new EmailAction("Confirm email", _link), "Ignore it if it wasn't you.");

    [Fact]
    public void Text_version_has_the_greeting_words_and_exactly_one_link()
    {
        var message = EmailTemplate.Render("sam@example.test", Content());

        Assert.Equal("sam@example.test", message.To);
        Assert.Equal("Confirm your email", message.Subject);
        Assert.StartsWith("Hi Sam,", message.TextBody, StringComparison.Ordinal);
        Assert.Contains("Confirm your email address.", message.TextBody, StringComparison.Ordinal);
        Assert.Equal(_link.AbsoluteUri, Assert.Single(UrlPattern().Matches(message.TextBody)).Value);
    }

    [Fact]
    public void Missing_greeting_says_hi_without_a_name()
    {
        var message = EmailTemplate.Render("sam@example.test", Content(greeting: null));

        Assert.StartsWith("Hi,", message.TextBody, StringComparison.Ordinal);
        Assert.Contains(">Hi,<", message.HtmlBody, StringComparison.Ordinal);
    }

    [Fact]
    public void Html_version_is_a_full_document_with_the_button_and_preview()
    {
        var html = EmailTemplate.Render("sam@example.test", Content()).HtmlBody;

        Assert.StartsWith("<!DOCTYPE html>", html, StringComparison.Ordinal);
        Assert.Contains("<html lang=\"en\">", html, StringComparison.Ordinal);
        Assert.Contains("One step left", html, StringComparison.Ordinal);
        Assert.Contains(">Confirm email</a>", html, StringComparison.Ordinal);
        Assert.Contains("href=\"https://app.example.test/confirm-email?userId=1&amp;token=abc\"", html, StringComparison.Ordinal);
        Assert.Contains("src=\"cid:parenthesis-icon\"", html, StringComparison.Ordinal);
        Assert.Contains(">Parent</span><span", html, StringComparison.Ordinal);
        Assert.DoesNotContain("src=\"http", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Mime_message_carries_both_versions_and_the_inline_icon()
    {
        var message = EmailTemplate.Render("sam@example.test", Content());
        using var mime = EmailMime.Build(new EmailOptions { FromAddress = "no-reply@example.test", FromName = "Parenthesis" }, message);

        Assert.Equal("Confirm your email", mime.Subject);
        Assert.Equal("no-reply@example.test", Assert.Single(mime.From.Mailboxes).Address);
        Assert.Equal(message.TextBody, mime.TextBody);
        Assert.Equal(message.HtmlBody, mime.HtmlBody);
        var icon = Assert.Single(mime.BodyParts.OfType<MimeKit.MimePart>(), part => part.ContentId == EmailTemplate.LogoContentId);
        Assert.Equal("image/png", icon.ContentType.MimeType);
    }

    [Fact]
    public void Mime_message_without_the_icon_reference_has_no_attachment()
    {
        using var mime = EmailMime.Build(new EmailOptions(), new EmailMessage("sam@example.test", "Hi", "text", "<p>html</p>"));

        Assert.DoesNotContain(mime.BodyParts.OfType<MimeKit.MimePart>(), part => part.ContentId is not null);
    }

    [Fact]
    public void Html_version_encodes_user_supplied_text()
    {
        var html = EmailTemplate.Render(
            "sam@example.test",
            Content(greeting: "<script>alert(1)</script>", paragraph: "Join \"Rivera & Sons\" <b>now</b>")).HtmlBody;

        Assert.DoesNotContain("<script>", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<b>", html, StringComparison.Ordinal);
        Assert.Contains("&lt;script&gt;", html, StringComparison.Ordinal);
        Assert.Contains("Rivera &amp; Sons", html, StringComparison.Ordinal);
    }

    [GeneratedRegex(@"https?://\S+")]
    private static partial Regex UrlPattern();
}
