using System.Net;
using System.Reflection;
using CoParent.Infrastructure.Email;

namespace CoParent.Api.Hosting;

internal static class FeedbackEndpoints
{
    private const string Recipient = "feedback@parenthesisfamily.com";
    internal const string RateLimitPolicy = "feedback";

    public static void MapFeedbackEndpoints(this IEndpointRouteBuilder api) =>
        api.MapPost("/feedback", SendAsync).RequireRateLimiting(RateLimitPolicy);

    private static async Task<IResult> SendAsync(
        FeedbackSubmission submission, IEmailSender sender, CancellationToken cancellationToken)
    {
        var message = submission.Message?.Trim();
        if (submission.Type is not ("bug" or "suggestion") || string.IsNullOrEmpty(message) || message.Length > 4000)
        {
            return Results.BadRequest();
        }

        var screen = submission.Screen switch
        {
            "home" or "calendar" or "messages" or "shared-records" or "child-essentials"
                or "from-your-kids" or "memories" or "settings" or "more" or "notifications" => submission.Screen,
            _ => "other",
        };
        var version = typeof(FeedbackEndpoints).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "Unknown";
        var subject = submission.Type == "bug" ? "Parenthesis feedback: Bug" : "Parenthesis feedback: Suggestion";
        var text = $"Screen: {screen}\nApp version: {version}\n\n{message}";
        var html = $"<pre style=\"white-space:pre-wrap\">{WebUtility.HtmlEncode(text)}</pre>";
        await sender.SendAsync(new EmailMessage(Recipient, subject, text, html), cancellationToken);
        return Results.NoContent();
    }

    internal sealed record FeedbackSubmission(string? Type, string? Message, string? Screen);
}
