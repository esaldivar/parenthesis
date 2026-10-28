using CoParent.SharedKernel.Domain;

namespace CoParent.Modules.Families.Domain;

/// <summary>What a PIN credential allows right now, before a PIN is checked.</summary>
internal enum PinState
{
    /// <summary>A PIN may be tried.</summary>
    Open,

    /// <summary>Three wrong PINs: no tries until <see cref="PinCredential.PausedUntil"/>.</summary>
    Paused,

    /// <summary>Three more wrong PINs after a pause: no tries until a parent sets a new PIN.</summary>
    ResetRequired,
}

/// <summary>The result of recording a wrong PIN.</summary>
internal enum PinFailure
{
    /// <summary>Wrong, with tries left in this round.</summary>
    TryAgain,

    /// <summary>This failure started the ten-minute pause.</summary>
    PausedNow,

    /// <summary>This failure locked the PIN until it is reset.</summary>
    LockedNow,
}

/// <summary>
/// The retry policy both parent and child PINs share (owner decisions on #153, October 28, 2026):
/// <list type="number">
/// <item>Three wrong PINs pause the PIN for ten minutes. No PIN is checked during the pause.</item>
/// <item>Three more wrong PINs after the pause lock it until an authorized parent sets a new PIN.</item>
/// <item>A right PIN clears the failed count and the earlier pause; a new PIN clears everything.</item>
/// </list>
/// The counts live on the credential, server-side, so they apply across every device and session.
/// </summary>
internal abstract class PinCredential : Entity, IFamilyScoped
{
    public const int AttemptsPerRound = 3;

    public static readonly TimeSpan PauseLength = TimeSpan.FromMinutes(10);

    public Guid FamilyId { get; init; }

    public required string PinHash { get; set; }

    /// <summary>Wrong PINs in the current round (before the pause, or after it).</summary>
    public int FailedAttempts { get; private set; }

    /// <summary>Set while a pause runs and kept afterwards, so the next round of failures locks instead of pausing.</summary>
    public DateTimeOffset? PausedUntil { get; private set; }

    /// <summary>Set when the PIN needs resetting. A right PIN doesn't clear it; only a new PIN does.</summary>
    public DateTimeOffset? LockedAt { get; private set; }

    public DateTimeOffset UpdatedAt { get; set; }

    /// <summary>
    /// PostgreSQL xmin. Two guesses checked at the same moment can't both be counted from the same starting count:
    /// the second save fails and that guess gets a neutral "try again", whatever the PIN was.
    /// </summary>
    public uint Version { get; private set; }

    /// <summary>
    /// Every PIN check, right or wrong, bumps this, so every check writes the row and is covered by <see cref="Version"/>.
    /// Without it a right guess that changes nothing would skip the concurrency check while wrong guesses race.
    /// </summary>
    public long CheckCount { get; private set; }

    public bool IsLocked => LockedAt is not null;

    public PinState StateAt(DateTimeOffset now) =>
        IsLocked ? PinState.ResetRequired
        : PausedUntil is { } until && now < until ? PinState.Paused
        : PinState.Open;

    public int TriesLeft => AttemptsPerRound - FailedAttempts;

    /// <summary>Counts a wrong PIN. Only call this when <see cref="StateAt"/> is <see cref="PinState.Open"/>.</summary>
    public PinFailure RecordFailure(DateTimeOffset now)
    {
        CheckCount++;
        FailedAttempts++;
        if (FailedAttempts < AttemptsPerRound)
        {
            return PinFailure.TryAgain;
        }

        FailedAttempts = 0;
        if (PausedUntil is null)
        {
            PausedUntil = now + PauseLength;
            return PinFailure.PausedNow;
        }

        LockedAt = now;
        return PinFailure.LockedNow;
    }

    /// <summary>A right PIN clears the failed count and the earlier pause stage.</summary>
    public void RecordSuccess() => (FailedAttempts, PausedUntil, CheckCount) = (0, null, CheckCount + 1);

    /// <summary>A parent set a new PIN: every count, pause and lock is cleared.</summary>
    public void Reset(string pinHash, DateTimeOffset now) =>
        (PinHash, FailedAttempts, PausedUntil, LockedAt, UpdatedAt) = (pinHash, 0, null, null, now);

    /// <summary>Not trivially guessable: not all the same digit, and not a straight run like 1234 or 9876.</summary>
    protected static bool IsNotTrivial(string pin)
    {
        var steps = pin.Zip(pin.Skip(1), (a, b) => b - a).Distinct().ToList();
        return !(steps.Count == 1 && steps[0] is 0 or 1 or -1);
    }
}
