namespace CoParent.ArchitectureTests;

/// <summary>
/// The production image (aspnet noble-chiseled) has no system time zone files, so a system lookup such as
/// <c>TimeZoneInfo.FindSystemTimeZoneById("America/Los_Angeles")</c> works on developer machines and in CI but throws in
/// every deployed environment. That broke address suggestions on the development site (#354). Use NodaTime's
/// <c>DateTimeZoneProviders.Tzdb</c>, which carries its own data.
/// </summary>
public class TimeZoneTests
{
    private static readonly string[] _systemLookups =
        ["FindSystemTimeZoneById", "TryFindSystemTimeZoneById", "GetSystemTimeZones", "ConvertTimeBySystemTimeZoneId"];

    [Fact]
    public void Backend_code_never_asks_the_operating_system_for_time_zones()
    {
        var backend = Path.Combine(RepositoryRoot(), "src", "backend");
        var sources = Directory.EnumerateFiles(backend, "*.cs", SearchOption.AllDirectories)
            .Where(path => !path.Split(Path.DirectorySeparatorChar).Any(part => part is "bin" or "obj"))
            .ToList();

        var offenders = sources
            .Where(path => _systemLookups.Any(File.ReadAllText(path).Contains))
            .Select(path => Path.GetRelativePath(backend, path))
            .ToList();

        Assert.NotEmpty(sources);
        Assert.Empty(offenders);
    }

    private static string RepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "CoParent.slnx")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new InvalidOperationException("CoParent.slnx not found above the test output.");
    }
}
