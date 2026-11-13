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
/// <param name="Latitude">Only after the parent pressed "Use my location" (#414). Rounded, never stored or logged.</param>
/// <param name="Longitude">Sent with <paramref name="Latitude"/>; either alone, or out of range, is ignored.</param>
internal sealed record PlaceSuggestionRequest(string? Input, string? SessionToken, double? Latitude = null, double? Longitude = null);

/// <param name="Suggestions">Up to three suggestions, as Google wrote them; picking one saves that text.</param>
/// <param name="Available">False when suggestions are off, used up for today, or Google didn't answer: the app stops
/// asking and the field works as plain text.</param>
internal sealed record PlaceSuggestionView(IReadOnlyList<string> Suggestions, bool Available);

/// <summary>
/// Address suggestions while a parent types an event's location (#354, owner decisions of October 29, 2026). The server
/// asks Google so the API key never reaches a browser; the typed text, the results and any position are neither logged
/// nor stored, and nothing else about the family is sent. A parent's position (#414) is rounded to about a kilometre and
/// only steers Google's results; it is never shared with the co-parent. Parents only. POST keeps the text and position
/// out of URLs and request logs.
/// </summary>
internal static class PlaceSuggestionEndpoints
{
    public const string RateLimitPolicy = "place-suggestions";
    public const int MinimumInput = 3;

    private static readonly PlaceSuggestionView _none = new([], Available: true);
    private static readonly PlaceSuggestionView _off = new([], Available: false);

    public static void Map(IEndpointRouteBuilder family)
    {
        family.MapGet("/calendar/place-suggestions", Status).WithTags("Calendar").RequireRateLimiting(RateLimitPolicy);
        family.MapPost("/calendar/place-suggestions", SuggestAsync).WithTags("Calendar").RequireRateLimiting(RateLimitPolicy);
    }

    /// <summary>
    /// Whether suggestions are on, so the Location field knows to offer "Use my location" (#414). Never calls Google and
    /// takes nothing from the daily cap.
    /// </summary>
    private static Results<Ok<PlaceSuggestionView>, ForbidHttpResult> Status(
        ITenantContext tenant,
        IOptions<PlacesOptions> options) =>
        tenant.Role != FamilyRole.Parent ? TypedResults.Forbid() : TypedResults.Ok(options.Value.IsOn ? _none : _off);

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
        var near = ApproximatePosition.From(request.Latitude, request.Longitude);
        var suggestions = await google.SuggestAsync(input, token, near, cancellationToken);
        return TypedResults.Ok(suggestions is null ? _off : new PlaceSuggestionView(suggestions, Available: true));
    }
}
