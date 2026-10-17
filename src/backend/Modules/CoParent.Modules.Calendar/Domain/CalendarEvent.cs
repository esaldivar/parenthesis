using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Calendar.Domain;

/// <summary>Calendar categories (docs/design/CALENDAR_DECISIONS.md, the dashboard's calendar key).</summary>
internal enum EventCategory
{
    /// <summary>Who has the children. Needs both parents (ADR-0003).</summary>
    ParentingTime,

    /// <summary>A joint family event both parents attend. Always needs both parents, even before the co-parent joins.</summary>
    Joint,

    School,
    Medical,
    Dental,
    Activity,
    Birthday,

    /// <summary>Needs both parents.</summary>
    Holiday,

    /// <summary>A parent's own unavailable time. Visible to both; its notes are private to that parent.</summary>
    Unavailable,

    Other,
}

internal enum EventStatus
{
    PendingApproval,
    Confirmed,
    Rejected,
    Cancelled,
}

/// <summary>An event on the family calendar. Activities never change parenting time.</summary>
internal sealed class CalendarEvent : Entity, IFamilyScoped
{
    public const int TitleMaxLength = 120;
    public const int LocationMaxLength = 200;
    public const int NotesMaxLength = 1000;

    public Guid FamilyId { get; init; }

    public required string Title { get; set; }

    public EventCategory Category { get; init; }

    public DateTimeOffset StartsAt { get; set; }

    public DateTimeOffset EndsAt { get; set; }

    public bool AllDay { get; set; }

    public string? Location { get; set; }

    /// <summary>For Unavailable events, shown only to the owner (CALENDAR_DECISIONS.md).</summary>
    public string? Notes { get; set; }

    public EventStatus Status { get; set; }

    /// <summary>ParentingTime only: the parent who has the children.</summary>
    public Guid? CaregiverMembershipId { get; init; }

    public Guid OwnerMembershipId { get; init; }

    /// <summary>Auto-confirmed while the family had one parent (architecture decision 7); shown so the co-parent can review it.</summary>
    public bool ConfirmedBeforeCoParentJoined { get; set; }

    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>PostgreSQL xmin.</summary>
    public uint Version { get; private set; }

    public List<EventChild> Children { get; } = [];

    /// <summary>Categories where both parents must agree (architecture §4 defaults). The rest are confirmed at once.</summary>
    public static bool NeedsApproval(EventCategory category) =>
        category is EventCategory.ParentingTime or EventCategory.Holiday or EventCategory.Joint;
}

/// <summary>Which children an event is about.</summary>
internal sealed class EventChild : IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public Guid EventId { get; init; }

    public Guid ChildProfileId { get; init; }
}
