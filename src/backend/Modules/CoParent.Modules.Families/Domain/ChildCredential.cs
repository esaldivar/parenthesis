using System.Text.RegularExpressions;

namespace CoParent.Modules.Families.Domain;

/// <summary>
/// A child's PIN: 4–6 digits, stored only as a hash, with the shared pause-then-lock policy (<see cref="PinCredential"/>,
/// #153). Having a credential is what "sign-in enabled" means; deleting it disables access at once.
/// </summary>
internal sealed partial class ChildCredential : PinCredential
{
    public Guid ChildProfileId { get; init; }

    /// <summary>
    /// A PIN change still waiting for the other parent's approval under the earlier ADR-0006 rule. New resets apply
    /// at once (#153), so this is only set on requests made before that change; a reset clears it.
    /// </summary>
    public string? PendingPinHash { get; set; }

    /// <summary>4–6 digits, and not trivially guessable.</summary>
    public static bool IsAcceptable(string pin) => PinFormat().IsMatch(pin) && IsNotTrivial(pin);

    [GeneratedRegex("^[0-9]{4,6}$")]
    private static partial Regex PinFormat();
}
