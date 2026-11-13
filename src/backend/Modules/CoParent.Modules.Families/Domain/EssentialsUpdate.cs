using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// One parent's notice that the other parent saved a shared Child Essentials section (#128). It holds only the child,
/// the section, the saved revision and which fields changed, never their values. Each indicator clears on its own:
/// the navigation dot (<see cref="NavSeenAt"/>), the section dot (<see cref="SectionSeenAt"/>) and each changed row's
/// highlight (<see cref="PendingFields"/>). The section's history keeps the change either way.
/// </summary>
internal sealed class EssentialsUpdate : Entity, IFamilyScoped
{
    public const int SectionMaxLength = 32;

    public required Guid FamilyId { get; init; }

    /// <summary>The parent who should see it; never the parent who saved.</summary>
    public required Guid RecipientMembershipId { get; init; }

    public required Guid ChildProfileId { get; init; }

    /// <summary>A <see cref="EssentialsSections"/> id, such as "clothing".</summary>
    public required string Section { get; init; }

    /// <summary>The section revision the save created: one notice per recipient and revision.</summary>
    public required int Revision { get; init; }

    /// <summary>The fields the save changed, such as "shoeSize".</summary>
    public required List<string> Fields { get; init; }

    /// <summary>Changed rows the recipient hasn't had on screen yet.</summary>
    public required List<string> PendingFields { get; set; }

    public required DateTimeOffset CreatedAt { get; init; }

    /// <summary>When the recipient opened Child Essentials after it (clears the navigation dot and its banner).</summary>
    public DateTimeOffset? NavSeenAt { get; set; }

    /// <summary>When the recipient opened this child's section after it (clears the section dot).</summary>
    public DateTimeOffset? SectionSeenAt { get; set; }
}

/// <summary>The shared sections that record updates, by the id the API and the app use.</summary>
internal static class EssentialsSections
{
    public const string School = "school";
    public const string AllergiesFood = "allergiesFood";
    public const string Clothing = "clothing";
    public const string WhatHelps = "whatHelps";
    public const string Routines = "routines";

    /// <summary>The co-parent's own routines at their home (their Routines tab); only its owner saves it.</summary>
    public const string HouseholdRoutines = "householdRoutines";
    public const string EmergencyContacts = "emergencyContacts";
    public const string Caregivers = "caregivers";

    /// <summary>Medical providers (#509); rows are provider ids, and "removed" when one was taken off.</summary>
    public const string Medical = "medical";

    /// <summary>Medication (#127); rows are entry ids, and "deleted" when one was permanently deleted.</summary>
    public const string Medication = "medication";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal)
    {
        School, AllergiesFood, Clothing, WhatHelps, Routines, HouseholdRoutines, EmergencyContacts, Caregivers, Medical,
        Medication,
    };
}
