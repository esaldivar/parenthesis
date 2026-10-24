using System.Text.RegularExpressions;
using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// A child's PIN (ADR-0006): 4–6 digits, stored only as a hash. Three wrong tries lock it until a parent unlocks it.
/// Having a credential is what "sign-in enabled" means; deleting it disables access at once.
/// </summary>
internal sealed partial class ChildCredential : Entity, IFamilyScoped
{
    public const int MaxFailedAttempts = 3;

    public Guid FamilyId { get; init; }

    public Guid ChildProfileId { get; init; }

    public required string PinHash { get; set; }

    /// <summary>A proposed new PIN (hashed), waiting for the other parent's approval. The current PIN keeps working.</summary>
    public string? PendingPinHash { get; set; }

    public int FailedAttempts { get; private set; }

    public DateTimeOffset? LockedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public bool IsLocked => LockedAt is not null;

    /// <summary>Counts a wrong PIN; returns true when this attempt locked the profile.</summary>
    public bool RecordFailure(DateTimeOffset now)
    {
        FailedAttempts++;
        if (FailedAttempts < MaxFailedAttempts || IsLocked)
        {
            return false;
        }

        LockedAt = now;
        return true;
    }

    public void RecordSuccess() => FailedAttempts = 0;

    public void Unlock(DateTimeOffset now)
    {
        (FailedAttempts, LockedAt, UpdatedAt) = (0, null, now);
    }

    /// <summary>4–6 digits, and not trivially guessable (all the same digit, or a straight run like 1234 or 9876).</summary>
    public static bool IsAcceptable(string pin)
    {
        if (!PinFormat().IsMatch(pin))
        {
            return false;
        }

        var steps = pin.Zip(pin.Skip(1), (a, b) => b - a).Distinct().ToList();
        return !(steps.Count == 1 && steps[0] is 0 or 1 or -1);
    }

    [GeneratedRegex("^[0-9]{4,6}$")]
    private static partial Regex PinFormat();
}
