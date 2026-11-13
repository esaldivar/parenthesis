using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>What went wrong talking to Google, in the terms the export acts on.</summary>
internal enum GooglePhotosFailure
{
    /// <summary>The parent's grant is gone (revoked, expired or never valid). Only reconnecting helps.</summary>
    Revoked,

    /// <summary>HTTP 429: Google is limiting requests. Wait at least 30 seconds (Google's guidance).</summary>
    RateLimited,

    /// <summary>Google errors and timeouts: back off and try again.</summary>
    Transient,

    /// <summary>Google refused this request as it was sent (for example an album it no longer knows).</summary>
    Rejected,
}

/// <summary>A failed Google call. The message never contains tokens, photo details or Google's response text.</summary>
internal sealed class GooglePhotosException : Exception
{
    public GooglePhotosException(GooglePhotosFailure failure, HttpStatusCode? status = null)
        : base($"Google Photos request failed: {failure} ({(int?)status})")
    {
        Failure = failure;
        Status = status;
    }

    public GooglePhotosException()
    {
    }

    public GooglePhotosException(string message)
        : base(message)
    {
    }

    public GooglePhotosException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public GooglePhotosFailure Failure { get; } = GooglePhotosFailure.Transient;

    public HttpStatusCode? Status { get; }
}

internal sealed record GooglePhotosGrant(string? RefreshToken, string AccessToken, TimeSpan ExpiresIn, string? Scope);

/// <summary>One item to add to an album: an uploaded token and the file name Google shows.</summary>
internal sealed record NewMediaItem(string UploadToken, string FileName);

/// <summary>
/// Google's answer for one item of a <c>batchCreate</c>, matched by upload token. <c>Code</c> is the google.rpc code:
/// 0 (or missing) is success.
/// </summary>
internal sealed record MediaItemResult(string UploadToken, int Code, string? MediaItemId)
{
    public bool Created => Code == 0 && !string.IsNullOrEmpty(MediaItemId);
}

/// <summary>
/// Google's OAuth and Photos Library REST APIs, through the <see cref="ClientName"/> HttpClient, which has no request
/// logging: URLs and bodies hold tokens and photo bytes. Only <c>photoslibrary.appendonly</c> calls are made: upload
/// bytes, create an album, add items to an album the app created.
/// </summary>
internal sealed class GooglePhotosClient(IHttpClientFactory clients, IOptions<GooglePhotosOptions> options)
{
    public const string ClientName = "google-photos";

    public static readonly Uri AuthorizeEndpoint = new("https://accounts.google.com/o/oauth2/v2/auth");
    public static readonly Uri TokenEndpoint = new("https://oauth2.googleapis.com/token");
    public static readonly Uri RevokeEndpoint = new("https://oauth2.googleapis.com/revoke");
    public static readonly Uri UploadEndpoint = new("https://photoslibrary.googleapis.com/v1/uploads");
    public static readonly Uri AlbumsEndpoint = new("https://photoslibrary.googleapis.com/v1/albums");
    public static readonly Uri BatchCreateEndpoint = new("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate");

    /// <summary>Google keeps upload tokens for a day; Parenthesis stops using one a little before that.</summary>
    public static readonly TimeSpan UploadTokenLifetime = TimeSpan.FromHours(23);

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// The consent page. <c>access_type=offline</c> and <c>prompt=consent</c> make Google issue a refresh token every
    /// time, including when the parent reconnects. No sign-in scopes, so Parenthesis doesn't learn the account.
    /// </summary>
    public Uri AuthorizeUrl(Uri redirectUri, string state, string codeChallenge) =>
        new(QueryHelpers.AddQueryString(AuthorizeEndpoint.ToString(), new Dictionary<string, string?>
        {
            ["client_id"] = options.Value.ClientId,
            ["redirect_uri"] = redirectUri.ToString(),
            ["response_type"] = "code",
            ["scope"] = GooglePhotosOptions.Scope,
            ["access_type"] = "offline",
            ["prompt"] = "consent",
            ["include_granted_scopes"] = "false",
            ["state"] = state,
            ["code_challenge"] = codeChallenge,
            ["code_challenge_method"] = "S256",
        }));

    public Task<GooglePhotosGrant> ExchangeCodeAsync(string code, string codeVerifier, Uri redirectUri, CancellationToken cancellationToken) =>
        TokenAsync(new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["code_verifier"] = codeVerifier,
            ["redirect_uri"] = redirectUri.ToString(),
        }, cancellationToken);

    public Task<GooglePhotosGrant> RefreshAsync(string refreshToken, CancellationToken cancellationToken) =>
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

    /// <summary>Sends a photo's bytes. Returns Google's upload token, which <see cref="BatchCreateAsync"/> turns into an item.</summary>
    public async Task<string> UploadAsync(string accessToken, Stream content, string contentType, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, UploadEndpoint, accessToken);
        request.Content = new StreamContent(content);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        request.Headers.Add("X-Goog-Upload-Content-Type", contentType);
        request.Headers.Add("X-Goog-Upload-Protocol", "raw");
        using var response = await SendAsync(request, cancellationToken);
        var token = (await response.Content.ReadAsStringAsync(cancellationToken)).Trim();
        return token.Length > 0 ? token : throw new GooglePhotosException(GooglePhotosFailure.Transient);
    }

    /// <summary>Makes an album in the parent's library. Returns its id.</summary>
    public async Task<string> CreateAlbumAsync(string accessToken, string title, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, AlbumsEndpoint, accessToken);
        request.Content = JsonContent.Create(new { album = new { title } }, options: _json);
        using var response = await SendAsync(request, cancellationToken);
        var created = await response.Content.ReadFromJsonAsync<IdResource>(_json, cancellationToken);
        return created?.Id is { Length: > 0 } id ? id : throw new GooglePhotosException(GooglePhotosFailure.Transient);
    }

    /// <summary>
    /// Creates items from upload tokens in an album the app made (at most 50). A 200 or 207 answer lists each item's
    /// own result; only those are trusted. Never called in parallel for one parent (Google's guidance).
    /// </summary>
    public async Task<IReadOnlyList<MediaItemResult>> BatchCreateAsync(
        string accessToken, string albumId, IReadOnlyList<NewMediaItem> items, CancellationToken cancellationToken)
    {
        using var request = Request(HttpMethod.Post, BatchCreateEndpoint, accessToken);
        request.Content = JsonContent.Create(
            new
            {
                albumId,
                newMediaItems = items.Select(i => new { simpleMediaItem = new { uploadToken = i.UploadToken, fileName = i.FileName } }),
            },
            options: _json);
        using var response = await SendAsync(request, cancellationToken);
        var body = await response.Content.ReadFromJsonAsync<BatchCreateResponse>(_json, cancellationToken);
        return (body?.NewMediaItemResults ?? [])
            .Where(r => r.UploadToken is { Length: > 0 })
            .Select(r => new MediaItemResult(r.UploadToken!, r.Status?.Code ?? 0, r.MediaItem?.Id))
            .ToList();
    }

    private async Task<GooglePhotosGrant> TokenAsync(Dictionary<string, string> form, CancellationToken cancellationToken)
    {
        form["client_id"] = options.Value.ClientId ?? "";
        form["client_secret"] = options.Value.ClientSecret ?? "";
        using var content = new FormUrlEncodedContent(form);
        using var response = await Client().PostAsync(TokenEndpoint, content, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            // 400 invalid_grant: the code was used or expired, or the refresh token was revoked. 401: our client is wrong.
            throw new GooglePhotosException(
                response.StatusCode is HttpStatusCode.BadRequest or HttpStatusCode.Unauthorized ? GooglePhotosFailure.Revoked : Classify(response.StatusCode),
                response.StatusCode);
        }

        var token = await response.Content.ReadFromJsonAsync<TokenResponse>(_json, cancellationToken);
        return token?.AccessToken is { Length: > 0 } access
            ? new GooglePhotosGrant(token.RefreshToken, access, TimeSpan.FromSeconds(Math.Max(token.ExpiresIn, 60)), token.Scope)
            : throw new GooglePhotosException(GooglePhotosFailure.Transient);
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = await Client().SendAsync(request, cancellationToken);
        if (response.IsSuccessStatusCode)
        {
            return response;
        }

        var status = response.StatusCode;
        response.Dispose();
        throw Failed(status);
    }

    private static GooglePhotosException Failed(HttpStatusCode status) => new(Classify(status), status);

    private static GooglePhotosFailure Classify(HttpStatusCode status) => status switch
    {
        HttpStatusCode.Unauthorized => GooglePhotosFailure.Revoked,
        HttpStatusCode.TooManyRequests => GooglePhotosFailure.RateLimited,
        HttpStatusCode.RequestTimeout => GooglePhotosFailure.Transient,
        _ when (int)status >= 500 => GooglePhotosFailure.Transient,
        _ => GooglePhotosFailure.Rejected,
    };

    private static HttpRequestMessage Request(HttpMethod method, Uri url, string accessToken)
    {
        var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return request;
    }

    private HttpClient Client() => clients.CreateClient(ClientName);

    private sealed record IdResource(string? Id);

    private sealed record BatchCreateResponse(List<BatchCreateResult>? NewMediaItemResults);

    private sealed record BatchCreateResult(string? UploadToken, RpcStatus? Status, IdResource? MediaItem);

    private sealed record RpcStatus(int Code);

    private sealed record TokenResponse(
        [property: JsonPropertyName("access_token")] string? AccessToken,
        [property: JsonPropertyName("refresh_token")] string? RefreshToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn,
        [property: JsonPropertyName("scope")] string? Scope);
}

/// <summary>Encrypts refresh tokens at rest and keeps short-lived access tokens in memory only.</summary>
internal sealed class GooglePhotosTokens(IDataProtectionProvider protection, GooglePhotosClient google, TimeProvider clock)
{
    public const string Purpose = "CoParent.Memories.GooglePhotos.RefreshToken.v1";

    private readonly IDataProtector _protector = protection.CreateProtector(Purpose);
    private readonly ConcurrentDictionary<Guid, (string Token, DateTimeOffset Until)> _access = new();

    public string Protect(string refreshToken) => _protector.Protect(refreshToken);

    public string Unprotect(string protectedToken) => _protector.Unprotect(protectedToken);

    public void Remember(Guid connectionId, GooglePhotosGrant grant) =>
        _access[connectionId] = (grant.AccessToken, clock.GetUtcNow() + grant.ExpiresIn - TimeSpan.FromMinutes(1));

    public void Forget(Guid connectionId) => _access.TryRemove(connectionId, out _);

    /// <summary>A current access token, refreshed when the cached one is about to expire.</summary>
    public async Task<string> AccessTokenAsync(Guid connectionId, string protectedRefreshToken, CancellationToken cancellationToken)
    {
        if (_access.TryGetValue(connectionId, out var cached) && cached.Until > clock.GetUtcNow())
        {
            return cached.Token;
        }

        var grant = await google.RefreshAsync(Unprotect(protectedRefreshToken), cancellationToken);
        Remember(connectionId, grant);
        return grant.AccessToken;
    }
}
