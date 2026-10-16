namespace CoParent.ArchitectureTests;

/// <summary>Dependency direction: Api → Modules → Infrastructure → SharedKernel (ADR-0001).</summary>
public class LayerDependencyTests
{
    [Fact]
    public void SharedKernel_depends_only_on_the_base_class_library()
    {
        var forbidden = Solution.SharedKernel.ReferencedAssemblyNames()
            .Where(name => name.StartsWith("CoParent.", StringComparison.Ordinal)
                || name.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal)
                || name.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal)
                || name.StartsWith("Npgsql", StringComparison.Ordinal));

        Assert.Empty(forbidden);
    }

    [Fact]
    public void Infrastructure_does_not_depend_on_modules_or_the_host()
    {
        var forbidden = Solution.Infrastructure.ReferencedAssemblyNames()
            .Where(name => name.StartsWith(Solution.ModulePrefix, StringComparison.Ordinal) || name == Solution.Api.Name());

        Assert.Empty(forbidden);
    }

    [Theory]
    [MemberData(nameof(Solution.ModuleNames), MemberType = typeof(Solution))]
    public void Modules_do_not_depend_on_the_host(string moduleName)
    {
        Assert.DoesNotContain(Solution.Api.Name(), Solution.Module(moduleName).ReferencedAssemblyNames());
    }

    [Fact]
    public void Module_discovery_finds_the_known_modules()
    {
        // Guards against the module rules passing vacuously because discovery found nothing.
        var names = Solution.Modules.Select(m => m.Name()).ToList();

        Assert.Contains("CoParent.Modules.Identity", names);
        Assert.Contains("CoParent.Modules.Families", names);
    }
}
