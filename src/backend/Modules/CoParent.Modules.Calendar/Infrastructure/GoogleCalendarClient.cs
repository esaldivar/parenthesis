using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>What went wrong talking to Google, in the terms the sync acts on.</summary>
internal enum GoogleFailure
{
    /// <summary>The parent's grant is gone (revoked, expired or never valid). Only reconnecting helps.</summary>
    Revoked,

    /// <summary>The calendar (or event) doesn't exist, or the grant may not see it.</summary>
    NotFound,

    /// <summary>Rate limits, Google errors, timeouts: try again on the next pass.</summary>
    Transient,

    /// <summary>Google refused this request as it was sent. Retrying the same thing won't help.</summary>
    Rejected,
}

/// <summary>A failed Google call. The message never contains tokens, event details or Google's response text.</summary>
internal sealed class GoogleCalendarException : Exception
{
    public GoogleCalendarException(GoogleFailure failure, HttpStatusCode? status = null)
        : base($"Google Calendar request failed: {failure} ({(int?)status})")
    {
        Failure = failure;
        Status = status;
    }

    public GoogleCalendarException()
    {
    }

    public GoogleCalendarException(string message)
        : base(message)
    {
    }

    public GoogleCalendarException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public GoogleFailure Failure { get; } = GoogleFailure.Transient;

    public HttpStatusCode? Status { get; }
}

internal sealed record GoogleTokens(string? RefreshToken, string AccessToken, TimeSpan ExpiresIn, string? Scope);

/// <summary>
/// Google's OAuth and Calendar REST APIs, through the <see cref="ClientName"/> HttpClient, which has no request
/// logging: URLs and bodies hold tokens and event details.
/// </summary>
internal sealed class GoogleCalendarClient(IHttpClientFactory clients, IOptions<GoogleCalendarOptions> options)
{
    public const string ClientName = "google-calendar";

    public static readonly Uri AuthorizeEndpoint = new("https://accounts.google.com/o/oauth2/v2/auth");
    public static readonly Uri TokenEndpoint = new("https://oauth2.googleapis.com/token");
    public static readonly Uri RevokeEndpoint = new("https://oauth2.googleapis.com/revoke");
    public const string CalendarApi = "https://www.googleapis.com/calendar/v3";

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// The consent page. <c>access_type=offline</c> and <c>prompt=consent</c> make Google issue a refresh token every
    /// time, including when the parent reconnects.
    /// </summary>
    public Uri AuthorizeUrl(Uri redirectUri, string state, string codeChallenge) =>
        new(QueryHelpers.AddQueryString(AuthorizeEndpoint.ToString(), new Dictionary<string, string?>
        {
            ["client_id"] = options.Value.ClientId,
            ["redirect_uri"] = redirectUri.ToString(),
            ["response_type"] = "code",
            ["scope"] = GoogleCalendarOptions.Scope,
            ["access_type"] = "offline",
            ["prompt"] = "consent",
            ["include_granted_scopes"] = "false",
            ["state"] = state,
            ["code_challenge"] = codeChallenge,
            ["code_challenge_method"] = "S256",
        }));

    public Task<GoogleTokens> ExchangeCodeAsync(string code, string codeVerifier, Uri redirectUri, CancellationToken cancellationToken) =>
        TokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["code_verifier"] = codeVerifier,
            ["redirect_uri"] = redirectUri.ToString(),
        }, cancellationToken);

    public Task<GoogleTokens> RefreshAsync(string refreshToken, CancellationToken cancellationToken) =>
        TokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refreshToken,
        }, cancellationToken);

    /// <summary>Ends the grant at Google. A token Google no longer knows is already revoked.</summary>
    public async Task RevokeAsync(string token, CancellationToken cancellationToken)
    {
        using var content = new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = token });
        using var response = await Client().PostAsync(RevokeEndpoint, content, cancellationToken);
        if (!response.IsSuccessStatusCode && response.StatusCode != HttpStatusCode.BadRequest)
        {
            throw Failed(response.StatusCode);
        }
    }

    /// <summary>Makes the secondary calendar that every event goes into. Returns its id.</summary>
    public async Task<string> CreateCalendarAsync(string accessToken, string name, string timeZone, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, $"{CalendarApi}/calendars", accessToken);
        request.Content = JsonContent.Create(new { summary = name, timeZone }, options: _json);
        using var response = await SendAsync(request, cancellationToken);
        var created = await response.Content.ReadFromJsonAsync<CalendarResource>(_json, cancellationToken);
        return created?.Id is { Length: > 0 } id ? id : throw new GoogleCalendarException(GoogleFailure.Transient);
    }

    /// <summary>Deletes a calendar Parenthesis made. One that's already gone counts as deleted.</summary>
    public async Task DeleteCalendarAsync(string accessToken, string calendarId, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Delete, $"{CalendarApi}/calendars/{Uri.EscapeDataString(calendarId)}", accessToken);
        await SendAsync(request, cancellationToken, missingIsFine: true);
    }

    /// <summary>
    /// Writes an event with a fixed id: replaces it when it exists (bringing back one that was deleted), otherwise
    /// inserts it. Two passes writing the same event can't make a duplicate.
    /// </summary>
    public async Task PutEventAsync(
        string accessToken, string calendarId, string eventId, JsonObject body, CancellationToken cancellationToken)
    {
        var events = $"{CalendarApi}/calendars/{Uri.EscapeDataString(calendarId)}/events";
        using (var update = Request(HttpMethod.Put, $"{events}/{eventId}", accessToken))
        {
            update.Content = JsonContent.Create(body, options: _json);
            using var updated = await Client().SendAsync(update, cancellationToken);
            if (updated.IsSuccessStatusCode)
            {
                return;
            }

            if (updated.StatusCode != HttpStatusCode.NotFound)
            {
                throw Failed(updated.StatusCode);
            }
        }

        var insertBody = body.DeepClone().AsObject();
        insertBody["id"] = eventId;
        using var insert = Request(HttpMethod.Post, events, accessToken);
        insert.Content = JsonContent.Create(insertBody, options: _json);
        using var inserted = await SendAsync(insert, cancellationToken);
    }

    /// <summary>Removes an event. One that's already gone counts as removed.</summary>
    public async Task DeleteEventAsync(string accessToken, string calendarId, string eventId, CancellationToken cancellationToken)
    {
        using var request = Request(
            HttpMethod.Delete, $"{CalendarApi}/calendars/{Uri.EscapeDataString(calendarId)}/events/{eventId}", accessToken);
        await SendAsync(request, cancellationToken, missingIsFine: true);
    }

    /// <summary>Whether the calendar still exists (the parent may have deleted it in Google Calendar).</summary>
    public async Task<bool> CalendarExistsAsync(string accessToken, string calendarId, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Get, $"{CalendarApi}/calendars/{Uri.EscapeDataString(calendarId)}", accessToken);
        using var response = await Client().SendAsync(request, cancellationToken);
        return response.StatusCode switch
        {
            _ when response.IsSuccessStatusCode => true,
            HttpStatusCode.NotFound or HttpStatusCode.Gone => false,
            var status => throw Failed(status),
        };
    }

    private async Task<GoogleTokens> TokenAsync(Dictionary<string, string> form, CancellationToken cancellationToken)
    {
        form["client_id"] = options.Value.ClientId ?? "";
        form["client_secret"] = options.Value.ClientSecret ?? "";
        using var content = new FormUrlEncodedContent(form);
        using var response = await Client().PostAsync(TokenEndpoint, content, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            // 400 invalid_grant: the code was used or expired, or the refresh token was revoked. 401: our client is wrong.
            throw new GoogleCalendarException(
                response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized ? GoogleFailure.Revoked : Transient(response.StatusCode),
                response.StatusCode);
        }

        var token = await response.Content.ReadFromJsonAsync<TokenResponse>(_json, cancellationToken);
        return token?.AccessToken is { Length: > 0 } access
            ? new GoogleTokens(token.RefreshToken, access, TimeSpan.FromSeconds(Math.Max(token.ExpiresIn, 60)), token.Scope)
            : throw new GoogleCalendarException(GoogleFailure.Transient);
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken, bool missingIsFine = false)
    {
        var response = await Client().SendAsync(request, cancellationToken);
        if (response.IsSuccessStatusCode || (missingIsFine && response.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone))
        {
            return response;
        }

        var status = response.StatusCode;
        response.Dispose();
        throw Failed(status);
    }

    private static GoogleCalendarException Failed(HttpStatusCode status) => new(
        status switch
        {
            HttpStatusCode.Unauthorized => GoogleFailure.Revoked,
            HttpStatusCode.NotFound or HttpStatusCode.Gone => GoogleFailure.NotFound,
            _ => Transient(status),
        },
        status);

    /// <summary>403 is usually a rate limit at Google; 408, 429 and 5xx are worth retrying too.</summary>
    private static GoogleFailure Transient(HttpStatusCode status) =>
        status is HttpStatusCode.Forbidden or HttpStatusCode.RequestTimeout or HttpStatusCode.TooManyRequests || (int)status >= 500
            ? GoogleFailure.Transient
            : GoogleFailure.Rejected;

    private static HttpRequestMessage Request(HttpMethod method, string url, string accessToken)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return request;
    }

    private HttpClient Client() => clients.CreateClient(ClientName);

    private sealed record CalendarResource(string? Id);

    private sealed record TokenResponse(
        [property: JsonPropertyName("access_token")] string? AccessToken,
        [property: JsonPropertyName("refresh_token")] string? RefreshToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn,
        [property: JsonPropertyName("scope")] string? Scope);
}
