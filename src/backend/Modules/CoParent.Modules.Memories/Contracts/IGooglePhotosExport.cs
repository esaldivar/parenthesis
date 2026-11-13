namespace CoParent.Modules.Memories.Contracts;

/// <summary>Sends queued Family Memories photos to parents' Google Photos (#404). The background worker runs it.</summary>
public interface IGooglePhotosExport
{
    /// <summary>One pass over every connected parent's due exports. Returns how many photos Google confirmed.</summary>
    Task<int> ExportAsync(CancellationToken cancellationToken = default);
}
