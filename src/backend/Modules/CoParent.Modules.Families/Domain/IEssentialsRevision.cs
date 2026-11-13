namespace CoParent.Modules.Families.Domain;

/// <summary>A saved revision of a shared Child Essentials section: its number, who saved it and when.</summary>
internal interface IEssentialsRevision
{
    int Revision { get; }

    Guid EditedByUserId { get; }

    DateTimeOffset EditedAt { get; }
}
