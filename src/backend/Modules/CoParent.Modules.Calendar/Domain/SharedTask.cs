using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Calendar.Domain;

/// <summary>
/// A shared task on the calendar ("Pack the science fair project", #73). It has no assignee: either parent creates,
/// edits, deletes or marks it done at once, with no approval, and it never changes parenting time. Deleting keeps the
/// row (marked deleted) so its history stays. Named <c>SharedTask</c> so it never clashes with <see cref="Task"/>.
/// </summary>
internal sealed class SharedTask : Entity, IFamilyScoped
{
    public const int TitleMaxLength = 80;
    public const int DetailsMaxLength = 1000;

    public Guid FamilyId { get; init; }

    public required string Title { get; set; }

    /// <summary>The day it's due, in the family's time zone.</summary>
    public DateOnly DueDate { get; set; }

    /// <summary>Optional: one child it's about.</summary>
    public Guid? ChildProfileId { get; set; }

    public string? Details { get; set; }

    public Guid CreatedByMembershipId { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    /// <summary>The last parent who edited it, for the quiet "edited by" note. Marking it done isn't an edit.</summary>
    public Guid? LastEditedByMembershipId { get; set; }

    public DateTimeOffset? LastEditedAt { get; set; }

    /// <summary>Who marked it done, shown quietly ("Done by Mom"). Always the signed-in parent; cleared by undo.</summary>
    public Guid? CompletedByMembershipId { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    public DateTimeOffset? DeletedAt { get; set; }

    /// <summary>When anything about it last changed, ticks included, so every change moves <see cref="Version"/>.</summary>
    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>
    /// The row version (#175). An edit carries the version the parent saw; a different one means the other parent
    /// changed it first, and the edit is refused with a conflict instead of silently overwriting that change.
    /// </summary>
    public uint Version { get; private set; }
}

/// <summary>
/// One line of a task's checklist (#175). Required items decide when the task is done; when none are required, every
/// item does (owner decision, October 22, 2026). Ticking records who did it and when, quietly.
/// </summary>
internal sealed class TaskChecklistItem : Entity, IFamilyScoped
{
    public const int TextMaxLength = 120;
    public const int MaxPerTask = 50;

    public Guid FamilyId { get; init; }

    public Guid TaskId { get; init; }

    public required string Text { get; set; }

    public bool Required { get; set; }

    /// <summary>Its place in the list, from 0.</summary>
    public int Position { get; set; }

    /// <summary>Who ticked it. Always the signed-in parent; cleared by unticking.</summary>
    public Guid? CompletedByMembershipId { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }
}

internal enum SharedTaskAction
{
    Created,
    Edited,
    Done,
    Undone,
    Deleted,
    ItemDone,
    ItemUndone,
}

/// <summary>Who changed what, and when. Records the names of the fields that changed, not their old values.</summary>
internal sealed class SharedTaskHistory : Entity, IFamilyScoped
{
    public const int ChangesMaxLength = 200;

    public Guid FamilyId { get; init; }

    public Guid TaskId { get; init; }

    public Guid ActorMembershipId { get; init; }

    public SharedTaskAction Action { get; init; }

    /// <summary>For edits: the fields that changed, e.g. "title, dueDate, checklist". For ticks: the item's id.</summary>
    public string? Changes { get; init; }

    public DateTimeOffset At { get; init; }
}

/// <summary>
/// A parent intentionally opened the task's details. Set only by that parent's explicit call, never by loading the
/// calendar; there are no read receipts, timers or tracking beyond this.
/// </summary>
internal sealed class SharedTaskSeen : IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public Guid TaskId { get; init; }

    public Guid MembershipId { get; init; }

    public DateTimeOffset SeenAt { get; set; }
}
