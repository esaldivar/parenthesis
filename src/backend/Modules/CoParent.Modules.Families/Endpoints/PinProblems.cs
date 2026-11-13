using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;

namespace CoParent.Modules.Families.Endpoints;

/// <summary>
/// The answers a PIN check can give (#153). Paused and locked PINs answer 423 with <c>state</c> ("paused" or
/// "locked") and, for a pause, the absolute <c>retryAt</c> time: the app shows it, but only the server decides when a
/// try is allowed. <c>notified</c> is present only when this request tried to send an email, and is true only if the
/// mail server accepted it, so the app never claims an email was sent when it wasn't.
/// </summary>
internal static class PinProblems
{
    public static bool ChildPinFormat(string pin) => pin.Length is >= 4 and <= 6 && pin.All(char.IsAsciiDigit);

    public static bool ParentPinFormat(string pin) => pin.Length == 6 && pin.All(char.IsAsciiDigit);

    public static ProblemHttpResult Wrong(int triesLeft) => TypedResults.Problem(
        title: "That PIN didn't work.",
        detail: triesLeft == 1 ? "1 try left." : $"{triesLeft} tries left.",
        statusCode: StatusCodes.Status401Unauthorized,
        extensions: new Dictionary<string, object?> { ["triesLeft"] = triesLeft });

    public static ProblemHttpResult ChildPaused(string firstName, DateTimeOffset retryAt) => TypedResults.Problem(
        title: $"{firstName}'s PIN is taking a short break.",
        detail: "Ask a parent for help, or try again when the break is over.",
        statusCode: StatusCodes.Status423Locked,
        extensions: new Dictionary<string, object?> { ["state"] = "paused", ["retryAt"] = retryAt });

    public static ProblemHttpResult ChildLocked(string firstName, bool? parentsNotified)
    {
        var extensions = new Dictionary<string, object?> { ["state"] = "locked" };
        if (parentsNotified is { } notified)
        {
            extensions["notified"] = notified;
        }

        return TypedResults.Problem(
            title: $"{firstName}'s PIN is locked.",
            detail: "Ask a parent to help reset it.",
            statusCode: StatusCodes.Status423Locked,
            extensions: extensions);
    }

    public static ProblemHttpResult ParentPaused(DateTimeOffset retryAt, bool? notified)
    {
        var extensions = new Dictionary<string, object?> { ["state"] = "paused", ["retryAt"] = retryAt };
        if (notified is { } sent)
        {
            extensions["notified"] = sent;
        }

        return TypedResults.Problem(
            title: "Your parent PIN is paused.",
            detail: "Too many wrong tries. Try again after the pause, or sign in with your email and password to reset your PIN.",
            statusCode: StatusCodes.Status423Locked,
            extensions: extensions);
    }

    public static ProblemHttpResult ParentLocked(bool? notified)
    {
        var extensions = new Dictionary<string, object?> { ["state"] = "locked" };
        if (notified is { } sent)
        {
            extensions["notified"] = sent;
        }

        return TypedResults.Problem(
            title: "Your parent PIN is locked.",
            detail: "Sign in with your email and password, then choose a new PIN in Settings. Your account isn't locked.",
            statusCode: StatusCodes.Status423Locked,
            extensions: extensions);
    }

    /// <summary>Two checks raced on the same PIN. Neither result is revealed; the user simply tries again.</summary>
    public static ProblemHttpResult Busy() => TypedResults.Problem(
        title: "We couldn't check that PIN.",
        detail: "Please try again.",
        statusCode: StatusCodes.Status409Conflict);

    public static ValidationProblem Malformed(string message) =>
        TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["pin"] = [message] });
}
