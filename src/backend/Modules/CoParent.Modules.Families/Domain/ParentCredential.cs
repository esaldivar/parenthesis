using System.Text.RegularExpressions;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// A parent's six-digit PIN for entering their own profile on a shared family device (#153). It belongs to one
/// family membership, is stored only as a hash and follows the shared pause-then-lock policy. It never replaces the
/// password: password sign-in stays available when the PIN is paused or locked.
/// </summary>
internal sealed partial class ParentCredential : PinCredential
{
    public Guid MembershipId { get; init; }

    /// <summary>Exactly six digits, and not trivially guessable.</summary>
    public static bool IsAcceptable(string pin) => PinFormat().IsMatch(pin) && IsNotTrivial(pin);

    [GeneratedRegex("^[0-9]{6}$")]
    private static partial Regex PinFormat();
}
