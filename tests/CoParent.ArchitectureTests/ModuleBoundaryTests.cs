using System.Reflection;
using System.Runtime.CompilerServices;

namespace CoParent.ArchitectureTests;

/// <summary>
/// A module's public surface is its <c>Contracts</c> namespace plus its <c>{Name}Module</c> registration class.
/// Everything else is internal, so the compiler itself stops other modules from reaching in.
/// </summary>
public class ModuleBoundaryTests
{
    [Theory]
    [MemberData(nameof(Solution.ModuleNames), MemberType = typeof(Solution))]
    public void Public_types_are_contracts_or_the_module_registration_class(string moduleName)
    {
        var module = Solution.Module(moduleName);
        var contracts = $"{module.Name()}.Contracts";
        var registration = $"{module.Name()}.{module.ModuleName()}Module";

        var violations = module.GetExportedTypes()
            .Where(t => t.FullName != registration
                && t.Namespace != contracts
                && t.Namespace?.StartsWith(contracts + ".", StringComparison.Ordinal) != true)
            .Select(t => t.FullName)
            .ToList();

        Assert.True(violations.Count == 0,
            $"Make these internal or move them to {contracts}: {string.Join(", ", violations)}");
    }

    [Theory]
    [MemberData(nameof(Solution.ModuleNames), MemberType = typeof(Solution))]
    public void Internals_are_visible_only_to_test_assemblies(string moduleName)
    {
        var friends = Solution.Module(moduleName)
            .GetCustomAttributes<InternalsVisibleToAttribute>()
            .Select(a => a.AssemblyName.Split(',')[0])
            .Where(name => !name.EndsWith("Tests", StringComparison.Ordinal)
                && name != "DynamicProxyGenAssembly2");

        Assert.Empty(friends);
    }

    [Theory]
    [MemberData(nameof(Solution.ModuleNames), MemberType = typeof(Solution))]
    public void Registration_class_exists(string moduleName)
    {
        var module = Solution.Module(moduleName);

        Assert.NotNull(module.GetType($"{module.Name()}.{module.ModuleName()}Module"));
    }
}
