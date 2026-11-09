namespace CoParent.Modules.Calendar.Endpoints;

/// <summary>Compatibility for calendar notes created before multiple child associations were supported.</summary>
internal static class ChildSelection
{
    public static IReadOnlyList<Guid> Resolve(Guid? legacy, IReadOnlyList<Guid>? selection) =>
        selection ?? (legacy is { } child ? [child] : []);

    public static Guid? Single(IReadOnlyList<Guid> selection) =>
        selection.Count == 1 ? selection[0] : null;
}
