namespace CoParent.SharedKernel.Domain;

/// <summary>Something that happened in the domain. Dispatched through the transactional outbox (F-09).</summary>
public interface IDomainEvent
{
    DateTimeOffset OccurredAt { get; }
}
