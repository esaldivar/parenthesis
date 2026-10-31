using CoParent.Modules.Calendar.Contracts;

namespace CoParent.Modules.Memories.Domain;

/// <summary>Why a parent can't add photos to an event right now. The app explains each one.</summary>
internal enum UploadBlock
{
    /// <summary>Pending, declined or cancelled: a proposal must never look confirmed.</summary>
    NotConfirmed,

    /// <summary>Unavailable time is one parent's private block.</summary>
    UnavailableTime,

    /// <summary>Parenting time: only the parent who has the children adds photos.</summary>
    NotCaregiver,

    /// <summary>Photos can be added from the event's start.</summary>
    NotStarted,

    /// <summary>More than 28 days after the event ended.</summary>
    WindowClosed,
}

/// <summary>
/// Owner-approved rules for event photos (#403, October 31, 2026; docs/design/handoffs/EVENT_PHOTOS_403.md).
/// </summary>
internal static class PhotoRules
{
    /// <summary>Most active photos on one event.</summary>
    public const int EventCap = 20;

    /// <summary>Each parent's reserved share of an event both parents can add to. No borrowing.</summary>
    public const int SharedCap = 10;

    /// <summary>Each parent's storage allowance, counted from the stored photo and thumbnail sizes.</summary>
    public const long StorageAllowanceBytes = 250_000_000;

    /// <summary>Photos are deleted this long after upload.</summary>
    public static readonly TimeSpan Retention = TimeSpan.FromDays(28);

    /// <summary>The stronger warning shows in a photo's final week.</summary>
    public static readonly TimeSpan FinalWarning = TimeSpan.FromDays(7);

    /// <summary>Uploads stay open this long after the event ends.</summary>
    public static readonly TimeSpan UploadWindowAfterEnd = TimeSpan.FromDays(28);

    /// <summary>
    /// Why <paramref name="membershipId"/> can't add photos now, or null when they can. Confirmed events only (a change
    /// pending still counts as confirmed); never Unavailable time; parenting time only for its caregiver; other
    /// categories for any active parent; from the event's start until 28 days after it ends.
    /// </summary>
    public static UploadBlock? Block(PhotoEvent photoEvent, Guid membershipId, IReadOnlySet<Guid> activeParents, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(photoEvent);
        ArgumentNullException.ThrowIfNull(activeParents);
        if (photoEvent.IsUnavailable)
        {
            return UploadBlock.UnavailableTime;
        }

        if (!photoEvent.IsConfirmed)
        {
            return UploadBlock.NotConfirmed;
        }

        if (!Uploaders(photoEvent, activeParents).Contains(membershipId))
        {
            return UploadBlock.NotCaregiver;
        }

        if (now < photoEvent.StartsAt)
        {
            return UploadBlock.NotStarted;
        }

        return now > photoEvent.EndsAt + UploadWindowAfterEnd ? UploadBlock.WindowClosed : null;
    }

    /// <summary>
    /// How many active photos <paramref name="membershipId"/> may have on the event: all 20 when they're its only
    /// eligible uploader, 10 when both parents are. Someone who isn't eligible now gets 0 (their photos stay).
    /// </summary>
    public static int Cap(PhotoEvent photoEvent, Guid membershipId, IReadOnlySet<Guid> activeParents)
    {
        var uploaders = Uploaders(photoEvent, activeParents);
        if (!uploaders.Contains(membershipId))
        {
            return 0;
        }

        return uploaders.Count > 1 ? SharedCap : EventCap;
    }

    /// <summary>Who may add photos to the event, ignoring its dates and status.</summary>
    public static IReadOnlySet<Guid> Uploaders(PhotoEvent photoEvent, IReadOnlySet<Guid> activeParents)
    {
        ArgumentNullException.ThrowIfNull(photoEvent);
        ArgumentNullException.ThrowIfNull(activeParents);
        if (photoEvent.IsUnavailable)
        {
            return new HashSet<Guid>();
        }

        if (photoEvent.IsParentingTime)
        {
            return photoEvent.CaregiverMembershipId is { } caregiver && activeParents.Contains(caregiver)
                ? new HashSet<Guid> { caregiver }
                : new HashSet<Guid>();
        }

        return activeParents;
    }
}
