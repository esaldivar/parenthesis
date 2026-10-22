using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Calendar.Domain;

/// <summary>
/// A shared, dated reminder ("Spirit Day: wear a blue shirt", #72). Either parent creates, edits or deletes it at once,
/// with no approval. It has no location (things that happen somewhere are events), no completion and no assignee, and
/// it never changes parenting time. Deleting keeps the row (marked deleted) so its history stays.
/// </summary>
internal sealed class Reminder : Entity, IFamilyScoped
{
    public const int TitleMaxLength = 80;
    public const int DetailsMaxLength = 1000;

    public Guid FamilyId { get; init; }

    public required string Title { get; set; }

    /// <summary>The moment it's for. All-day reminders store the start of that day in the family's time zone.</summary>
    public DateTimeOffset StartsAt { get; set; }

    public bool AllDay { get; set; }

    /// <summary>Optional: one child it's about.</summary>
    public Guid? ChildProfileId { get; set; }

    public string? Details { get; set; }

    public Guid CreatedByMembershipId { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>The last parent who edited it, for the quiet "edited by" note.</summary>
    public Guid? LastEditedByMembershipId { get; set; }

    public DateTimeOffset? LastEditedAt { get; set; }

    public DateTimeOffset? DeletedAt { get; set; }
}

internal enum ReminderAction
{
    Created,
    Edited,
    Deleted,
}

/// <summary>Who changed what, and when. Records the names of the fields that changed, not their old values.</summary>
internal sealed class ReminderHistory : Entity, IFamilyScoped
{
    public const int ChangesMaxLength = 200;

    public Guid FamilyId { get; init; }

    public Guid ReminderId { get; init; }

    public Guid ActorMembershipId { get; init; }

    public ReminderAction Action { get; init; }

    /// <summary>For edits: the fields that changed, e.g. "title, startsAt".</summary>
    public string? Changes { get; init; }

    public DateTimeOffset At { get; init; }
}

/// <summary>
/// A parent intentionally opened the reminder's details. Set only by that parent's explicit call, never by loading the
/// calendar; there are no read receipts, timers or tracking beyond this.
/// </summary>
internal sealed class ReminderSeen : IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public Guid ReminderId { get; init; }

    public Guid MembershipId { get; init; }

    public DateTimeOffset SeenAt { get; set; }
}
