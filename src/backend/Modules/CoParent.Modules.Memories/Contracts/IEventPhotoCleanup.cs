namespace CoParent.Modules.Memories.Contracts;

/// <summary>
/// One pass of event photo cleanup (#403): removes the files of expired, deleted and abandoned photos and frees their
/// spots and storage. A background worker runs it on a timer; tests run it directly.
/// </summary>
public interface IEventPhotoCleanup
{
    /// <summary>Returns how many photos it cleaned up.</summary>
    Task<int> CleanUpAsync(CancellationToken cancellationToken = default);
}
