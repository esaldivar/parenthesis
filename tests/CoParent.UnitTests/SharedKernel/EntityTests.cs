using CoParent.SharedKernel.Domain;

namespace CoParent.UnitTests.SharedKernel;

public class EntityTests
{
    private sealed record SomethingHappened(DateTimeOffset OccurredAt) : IDomainEvent;

    private sealed class Widget : Entity
    {
        public void DoSomething(DateTimeOffset at) => Raise(new SomethingHappened(at));
    }

    [Fact]
    public void New_entity_gets_a_version_7_id()
    {
        var widget = new Widget();

        Assert.NotEqual(Guid.Empty, widget.Id);
        Assert.Equal(7, widget.Id.Version);
    }

    [Fact]
    public void New_entities_get_distinct_ids()
    {
        var ids = Enumerable.Range(0, 1_000).Select(_ => new Widget().Id).ToHashSet();

        Assert.Equal(1_000, ids.Count);
    }

    [Fact]
    public void Raised_events_are_collected_until_cleared()
    {
        var widget = new Widget();
        var at = new DateTimeOffset(2026, 10, 16, 12, 0, 0, TimeSpan.Zero);

        widget.DoSomething(at);
        widget.DoSomething(at.AddMinutes(1));

        Assert.Equal(2, widget.DomainEvents.Count);
        Assert.Equal(at, widget.DomainEvents[0].OccurredAt);

        widget.ClearDomainEvents();

        Assert.Empty(widget.DomainEvents);
    }
}
