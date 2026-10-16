using System.Reflection;
using CoParent.Infrastructure.Persistence;
using CoParent.SharedKernel.Domain;

namespace CoParent.ArchitectureTests;

/// <summary>The production assemblies under test. Module assemblies are discovered, so new modules are covered automatically.</summary>
internal static class Solution
{
    public const string ModulePrefix = "CoParent.Modules.";

    public static Assembly SharedKernel { get; } = typeof(Entity).Assembly;

    public static Assembly Infrastructure { get; } = typeof(UnitOfWork).Assembly;

    public static Assembly Api { get; } = typeof(Program).Assembly;

    /// <summary>Every CoParent.Modules.*.dll next to the tests (the Api project references all modules).</summary>
    public static IReadOnlyList<Assembly> Modules { get; } = Directory
        .GetFiles(AppContext.BaseDirectory, $"{ModulePrefix}*.dll")
        .Select(path => Assembly.Load(AssemblyName.GetAssemblyName(path)))
        .OrderBy(a => a.GetName().Name, StringComparer.Ordinal)
        .ToList();

    public static string Name(this Assembly assembly) => assembly.GetName().Name!;

    /// <summary>"CoParent.Modules.Families" → "Families".</summary>
    public static string ModuleName(this Assembly module) => module.Name()[ModulePrefix.Length..];

    public static IEnumerable<string> ReferencedAssemblyNames(this Assembly assembly) =>
        assembly.GetReferencedAssemblies().Select(a => a.Name!);

    public static TheoryData<string> ModuleNames()
    {
        var data = new TheoryData<string>();
        foreach (var module in Modules)
        {
            data.Add(module.Name());
        }

        return data;
    }

    public static Assembly Module(string name) => Modules.Single(m => m.Name() == name);
}
