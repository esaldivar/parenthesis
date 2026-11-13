using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Calendar.Domain;

internal enum CalendarNoticeKind
{
    Added,
    Updated,
    Cancelled,
}

internal sealed class CalendarNotice : IFamilyScoped
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid FamilyId { get; init; }
    public Guid RecipientMembershipId { get; init; }
    public Guid EventId { get; init; }
    public CalendarNoticeKind Kind { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public DateTimeOffset? SeenAt { get; set; }
}
