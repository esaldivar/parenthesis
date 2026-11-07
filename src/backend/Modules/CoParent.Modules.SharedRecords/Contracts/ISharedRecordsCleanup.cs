namespace CoParent.Modules.SharedRecords.Contracts;

/// <summary>Removes the files of reports whose family closed (#477). Runs on a timer; tests call it directly.</summary>
public interface ISharedRecordsCleanup
{
    /// <summary>Deletes waiting files, then their rows. Returns how many reports were finished.</summary>
    Task<int> CleanUpAsync(CancellationToken cancellationToken = default);
}
