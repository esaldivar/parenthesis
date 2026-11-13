using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>Who chose a profile photo: a parent (by membership) or a child (by child profile).</summary>
internal enum PhotoChooser
{
    Parent,
    Child,
}

/// <summary>
/// A profile photo one person chose for one person (#388). Each choice belongs to whoever made it, and nobody else can
/// change it or see it unless the display rules say so:
/// <list type="bullet">
/// <item>A parent's own photo: chooser and subject are the parent's membership. Both parents see it.</item>
/// <item>A parent's personal photo for a child: chooser is the parent, subject the child. Only that parent sees it.</item>
/// <item>A child's own photo: chooser and subject are the child. The child sees it, and the shared-device picker shows it.</item>
/// </list>
/// Replacing a photo adds a new row and removes the old one in the same transaction, so each id always means the same
/// picture and a failed replacement leaves the previous photo in place. Photos hold processed WebP bytes only (see
/// <c>AvatarImages</c>); they are separate from any shared memories or diary content.
/// </summary>
internal sealed class ProfilePhoto : Entity, IFamilyScoped
{
    public Guid FamilyId { get; init; }

    public PhotoChooser ChooserKind { get; init; }

    /// <summary>The choosing parent's membership id, or the choosing child's id.</summary>
    public Guid ChooserId { get; init; }

    /// <summary>The pictured person: a parent's membership id or a child's id.</summary>
    public Guid SubjectId { get; init; }

    public required byte[] Content { get; init; }

    public required string ContentType { get; init; }

    public int Side { get; init; }

    public DateTimeOffset CreatedAt { get; init; }

    public bool IsOwnPhoto => ChooserId == SubjectId;
}
