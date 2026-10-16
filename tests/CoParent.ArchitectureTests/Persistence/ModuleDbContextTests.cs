using CoParent.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.ArchitectureTests.Persistence;

/// <summary>
/// Applies the model rules to every module DbContext the real host registers. Building a model needs no database,
/// so the connection string is a placeholder that is never opened.
/// </summary>
public sealed class ModuleDbContextTests : IDisposable
{
    private readonly WebApplicationFactory<Program> _host = new WebApplicationFactory<Program>().WithWebHostBuilder(b => b
        .UseEnvironment("Testing")
        .UseSetting("ConnectionStrings:Postgres", "Host=localhost;Database=never-opened"));

    public void Dispose() => _host.Dispose();

    [Fact]
    public void Every_family_scoped_entity_has_a_tenant_filter()
    {
        var violations = ForEachModuleContext((context, _) =>
            ModelRules.FindFamilyScopedEntitiesWithoutTenantFilter(context.Model));

        Assert.Empty(violations);
    }

    [Fact]
    public void Every_module_keeps_its_tables_in_its_own_schema()
    {
        var violations = ForEachModuleContext((context, schema) =>
            ModelRules.FindTablesOutsideSchema(context.Model, schema));

        Assert.Empty(violations);
    }

    [Fact]
    public void Module_schemas_are_unique()
    {
        var schemas = _host.Services.GetServices<ModuleDbContextRegistration>().Select(r => r.Schema).ToList();

        Assert.Equal(schemas.Count, schemas.Distinct(StringComparer.Ordinal).Count());
    }

    private List<string> ForEachModuleContext(Func<DbContext, string, IEnumerable<string>> rule)
    {
        using var scope = _host.Services.CreateScope();

        return _host.Services.GetServices<ModuleDbContextRegistration>()
            .SelectMany(registration =>
            {
                var context = (DbContext)scope.ServiceProvider.GetRequiredService(registration.ContextType);
                return rule(context, registration.Schema).Select(v => $"{registration.ContextType.Name}: {v}");
            })
            .ToList();
    }
}
