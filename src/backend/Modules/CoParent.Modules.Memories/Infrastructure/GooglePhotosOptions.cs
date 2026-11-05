namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>
/// Exporting Family Memories photos to parents' Google Photos (#404), configured under <c>GooglePhotos</c>. Without a
/// client id and secret the feature is off: Settings and the export button say it isn't available and nothing calls
/// Google. It uses its own OAuth client, separate from Google Calendar's, so disconnecting one never revokes the other.
/// </summary>
internal sealed class GooglePhotosOptions
{
    public const string Section = "GooglePhotos";

    /// <summary>
    /// The only scope requested. Google: "Only allows new media to be created in the user's library and in albums
    /// created by the app." Parenthesis can't see, list or change anything else, including the albums it made.
    /// </summary>
    public const string Scope = "https://www.googleapis.com/auth/photoslibrary.appendonly";

    /// <summary>Where Google sends the parent back to, under <c>App:PublicBaseUrl</c>. Registered in Google Cloud.</summary>
    public const string CallbackPath = "/settings/google-photos";

    /// <summary>The OAuth web client id from Google Cloud (its own client, not Google Calendar's).</summary>
    public string? ClientId { get; set; }

    /// <summary>The OAuth client secret. Key Vault in Azure, user-secrets locally; never in the repository.</summary>
    public string? ClientSecret { get; set; }

    /// <summary>Lets an environment switch the feature off while keeping its client (production until Google approves).</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>How often queued exports are sent, at most. Queueing an export also starts a pass straight away.</summary>
    public TimeSpan ExportInterval { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>The most photos sent for one parent in one pass. Google's <c>batchCreate</c> takes up to 50.</summary>
    public int MaxPhotosPerPass { get; set; } = 50;

    /// <summary>
    /// Google allows 10,000 Library API requests per project per day. Parenthesis stops below that and says Google is
    /// limiting exports, rather than spending the whole allowance. Counted in the database, across every running copy
    /// of the app.
    /// </summary>
    public int DailyRequestLimit { get; set; } = 9000;

    /// <summary>Whether the background worker sends exports. Tests turn it off and run passes themselves.</summary>
    public bool BackgroundExport { get; set; } = true;

    public bool IsOn => Enabled && !string.IsNullOrWhiteSpace(ClientId) && !string.IsNullOrWhiteSpace(ClientSecret);
}
