using CoParent.Modules.Calendar.Infrastructure;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Calendar.Endpoints;

/// <param name="Input">What the parent has typed in the Location field so far.</param>
/// <param name="SessionToken">One per typing session (a UUID), so Google counts a session, not each keystroke.</param>
internal sealed record PlaceSuggestionRequest(string? Input, string? SessionToken);

/// <param name="Suggestions">Up to five suggestions, as Google wrote them; picking one saves that text.</param>
/// <param name="Available">False when suggestions are off, used up for today, or Google didn't answer: the app stops
/// asking and the field works as plain text.</param>
internal sealed record PlaceSuggestionView(IReadOnlyList<string> Suggestions, bool Available);

/// <summary>
/// Address suggestions while a parent types an event's location (#354, owner decisions of October 29, 2026). The server
/// asks Google so the API key never reaches a browser; the typed text and the results are neither logged nor stored,
/// and nothing else about the family is sent. Parents only. POST keeps the text out of URLs and request logs.
/// </summary>
internal static class PlaceSuggestionEndpoints
{
    public const string RateLimitPolicy = "place-suggestions";
    public const int MinimumInput = 3;

    private static readonly PlaceSuggestionView _none = new([], Available: true);
    private static readonly PlaceSuggestionView _off = new([], Available: false);

    public static void Map(IEndpointRouteBuilder family) =>
        family.MapPost("/calendar/place-suggestions", SuggestAsync).WithTags("Calendar").RequireRateLimiting(RateLimitPolicy);

    private static async Task<Results<Ok<PlaceSuggestionView>, ForbidHttpResult>> SuggestAsync(
        PlaceSuggestionRequest request,
        ITenantContext tenant,
        IOptions<PlacesOptions> options,
        PlaceSuggestionQuota quota,
        GooglePlaceSuggestions google,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!options.Value.IsOn)
        {
            return TypedResults.Ok(_off);
        }

        var input = string.Join(' ', (request.Input ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        if (input.Length < MinimumInput || input.Length > Domain.CalendarEvent.LocationMaxLength)
        {
            return TypedResults.Ok(_none);
        }

        if (!quota.TryTake())
        {
            return TypedResults.Ok(_off);
        }

        var token = GooglePlaceSuggestions.IsSessionToken(request.SessionToken) ? request.SessionToken : null;
        var suggestions = await google.SuggestAsync(input, token, cancellationToken);
        return TypedResults.Ok(suggestions is null ? _off : new PlaceSuggestionView(suggestions, Available: true));
    }
}
