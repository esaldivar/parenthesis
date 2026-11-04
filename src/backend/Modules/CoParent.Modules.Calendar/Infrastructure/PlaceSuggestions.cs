using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using CoParent.Modules.Calendar.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>
/// Address suggestions for an event's location (#354), from Google Places Autocomplete (New). Configured under
/// <c>Places</c>; with no <c>ApiKey</c> the feature is off and the app behaves as before.
/// </summary>
internal sealed class PlacesOptions
{
    public const string Section = "Places";

    /// <summary>The server-side Google Maps Platform key, restricted to the Places API (New). Never sent to browsers.</summary>
    public string? ApiKey { get; set; }

    /// <summary>Lets an environment switch suggestions off while keeping its key.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Google requests allowed per Pacific day, the day Google's own quota uses. 300 a day stays under the 10,000
    /// Autocomplete Requests a month that Google gives free (owner decision, October 29, 2026). The owner sets the
    /// same quota in Google Cloud, which is the hard limit; this one keeps us from reaching it.
    /// </summary>
    public int DailyLimit { get; set; } = 300;

    public bool IsOn => Enabled && !string.IsNullOrWhiteSpace(ApiKey) && DailyLimit > 0;
}

/// <summary>
/// Counts Google requests per Pacific day across this API instance and refuses past <see cref="PlacesOptions.DailyLimit"/>.
/// Google's quota is the hard limit; this keeps a running instance from spending it. The Pacific day comes from NodaTime's
/// built-in time zones (through <see cref="EventSchedule.LocalDate"/>): the production image has no system time zone files.
/// </summary>
internal sealed class PlaceSuggestionQuota(TimeProvider clock, IOptions<PlacesOptions> options)
{
    private const string Pacific = "America/Los_Angeles";
    private readonly Lock _gate = new();
    private DateOnly _day;
    private int _used;

    /// <summary>Takes one request from today's allowance, or returns false when it's used up.</summary>
    public bool TryTake()
    {
        var today = EventSchedule.LocalDate(clock.GetUtcNow(), Pacific);
        lock (_gate)
        {
            if (today != _day)
            {
                (_day, _used) = (today, 0);
            }

            if (_used >= options.Value.DailyLimit)
            {
                return false;
            }

            _used++;
            return true;
        }
    }
}

/// <summary>
/// A parent's position, rounded to two decimal places (about a kilometre) before it goes anywhere (#414). Only the
/// parent who pressed "Use my location" sends it; it is never stored, logged, or shown to anyone.
/// </summary>
internal readonly record struct ApproximatePosition(double Latitude, double Longitude)
{
    private const int Decimals = 2;

    /// <summary>The rounded position, or null unless both values are present and in range (NaN and infinity never are).</summary>
    public static ApproximatePosition? From(double? latitude, double? longitude) =>
        latitude is { } lat && longitude is { } lng
        && lat is >= -90 and <= 90 && lng is >= -180 and <= 180
            ? new ApproximatePosition(
                Math.Round(lat, Decimals, MidpointRounding.AwayFromZero),
                Math.Round(lng, Decimals, MidpointRounding.AwayFromZero))
            : null;
}

/// <summary>Calls Google. Neither the typed text nor the results are logged or stored.</summary>
internal sealed partial class GooglePlaceSuggestions(
    IHttpClientFactory clients,
    IOptions<PlacesOptions> options,
    ILogger<GooglePlaceSuggestions> logger)
{
    public const string ClientName = "google-places";
    public static readonly Uri Endpoint = new("https://places.googleapis.com/v1/places:autocomplete");

    /// <summary>Only the suggestion text: the cheapest Autocomplete field, and nothing we don't show.</summary>
    public const string FieldMask = "suggestions.placePrediction.text.text";

    /// <summary>
    /// At most this many suggestions, so the list stays calm (owner decision, October 29, 2026).
    /// </summary>
    public const int MaxSuggestions = 3;

    /// <summary>How far around the parent's position Google favours places (#414): Google's largest bias circle.</summary>
    public const double NearbyRadiusMeters = 50_000;

    /// <summary>Without a position, only US places are suggested (owner decision, November 4, 2026).</summary>
    public static readonly IReadOnlyList<string> DefaultRegions = ["us"];

    /// <summary>
    /// Up to <see cref="MaxSuggestions"/> suggestions, or null when Google couldn't answer (the app then just shows none).
    /// With <paramref name="near"/>, Google favours places around it but still offers distant ones; without it, only US
    /// places. Google otherwise guesses from the caller's address, which is our server's, not the parent's.
    /// </summary>
    public async Task<IReadOnlyList<string>?> SuggestAsync(
        string input,
        string? sessionToken,
        ApproximatePosition? near,
        CancellationToken cancellationToken)
    {
        var bias = near is { } position
            ? new GoogleBias(new GoogleCircle(new GoogleLatLng(position.Latitude, position.Longitude), NearbyRadiusMeters))
            : null;
        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint)
        {
            Content = JsonContent.Create(new GoogleRequest(input, sessionToken, bias, bias is null ? DefaultRegions : null)),
        };
        request.Headers.Add("X-Goog-Api-Key", options.Value.ApiKey);
        request.Headers.Add("X-Goog-FieldMask", FieldMask);

        try
        {
            using var response = await clients.CreateClient(ClientName).SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                LogRefused(logger, (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadFromJsonAsync<GoogleResponse>(cancellationToken);
            return (body?.Suggestions ?? [])
                .Select(s => s.PlacePrediction?.Text?.Text?.Trim())
                .OfType<string>()
                .Where(text => text.Length is > 0 and <= CalendarEvent.LocationMaxLength)
                .Distinct()
                .Take(MaxSuggestions)
                .ToList();
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException
                                          && !cancellationToken.IsCancellationRequested)
        {
            LogUnavailable(logger, exception.GetType().Name);
            return null;
        }
    }

    /// <summary>Google's session tokens: URL- and filename-safe, at most 36 characters (a UUID fits).</summary>
    public static bool IsSessionToken(string? token) => token is not null && SessionToken().IsMatch(token);

    [GeneratedRegex("^[A-Za-z0-9_-]{1,36}$")]
    private static partial Regex SessionToken();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Place suggestions: Google answered {StatusCode}.")]
    private static partial void LogRefused(ILogger logger, int statusCode);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Place suggestions: Google unavailable ({Error}).")]
    private static partial void LogUnavailable(ILogger logger, string error);

    private sealed record GoogleRequest(
        [property: JsonPropertyName("input")] string Input,
        [property: JsonPropertyName("sessionToken"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? SessionToken,
        [property: JsonPropertyName("locationBias"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] GoogleBias? LocationBias,
        [property: JsonPropertyName("includedRegionCodes"), JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        IReadOnlyList<string>? IncludedRegionCodes);

    private sealed record GoogleBias([property: JsonPropertyName("circle")] GoogleCircle Circle);

    private sealed record GoogleCircle(
        [property: JsonPropertyName("center")] GoogleLatLng Center,
        [property: JsonPropertyName("radius")] double Radius);

    private sealed record GoogleLatLng(
        [property: JsonPropertyName("latitude")] double Latitude,
        [property: JsonPropertyName("longitude")] double Longitude);

    private sealed record GoogleResponse([property: JsonPropertyName("suggestions")] List<GoogleSuggestion>? Suggestions);

    private sealed record GoogleSuggestion([property: JsonPropertyName("placePrediction")] GooglePrediction? PlacePrediction);

    private sealed record GooglePrediction([property: JsonPropertyName("text")] GoogleText? Text);

    private sealed record GoogleText([property: JsonPropertyName("text")] string? Text);
}
