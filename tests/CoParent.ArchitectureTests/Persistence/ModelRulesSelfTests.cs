using CoParent.SharedKernel.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace CoParent.ArchitectureTests.Persistence;

/// <summary>
/// Proves the model rules catch violations. Until modules have entities, the checks against real module
/// contexts pass with nothing to inspect, so these tests are what show the rules work.
/// </summary>
public class ModelRulesSelfTests
{
    private static readonly Guid _currentFamily = Guid.CreateVersion7();

    [Fact]
    public void Family_scoped_entity_without_filter_is_reported()
    {
        using var context = new SampleContext(withFilter: false, schema: "sample");

        var violations = ModelRules.FindFamilyScopedEntitiesWithoutTenantFilter(context.Model);

        Assert.Equal([$"{nameof(Memo)} has no query filter on FamilyId"], violations);
    }

    [Fact]
    public void Family_scoped_entity_with_family_filter_passes()
    {
        using var context = new SampleContext(withFilter: true, schema: "sample");

        Assert.Empty(ModelRules.FindFamilyScopedEntitiesWithoutTenantFilter(context.Model));
    }

    [Fact]
    public void Filter_that_ignores_family_id_is_reported()
    {
        using var context = new SampleContext(withFilter: false, schema: "sample", unrelatedFilter: true);

        Assert.Single(ModelRules.FindFamilyScopedEntitiesWithoutTenantFilter(context.Model));
    }

    [Fact]
    public void Tables_in_the_wrong_schema_are_reported()
    {
        using var context = new SampleContext(withFilter: true, schema: "other");

        var violations = ModelRules.FindTablesOutsideSchema(context.Model, "sample");

        Assert.Equal(3, violations.Count); // default schema + Memo + Sticker
    }

    [Fact]
    public void Tables_in_the_module_schema_pass()
    {
        using var context = new SampleContext(withFilter: true, schema: "sample");

        Assert.Empty(ModelRules.FindTablesOutsideSchema(context.Model, "sample"));
    }

    public sealed class Memo : IFamilyScoped
    {
        public Guid Id { get; set; }

        public Guid FamilyId { get; set; }

        public bool Archived { get; set; }
    }

    /// <summary>Not family-scoped, so it needs no tenant filter.</summary>
    public sealed class Sticker
    {
        public Guid Id { get; set; }
    }

    private sealed class SampleContext(bool withFilter, string schema, bool unrelatedFilter = false) : DbContext
    {
        public (bool, string, bool) ModelKey => (withFilter, schema, unrelatedFilter);

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) => optionsBuilder
            .UseNpgsql("Host=localhost;Database=unused")
            .ReplaceService<IModelCacheKeyFactory, SampleModelCacheKeyFactory>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.HasDefaultSchema(schema);
            var memo = modelBuilder.Entity<Memo>();
            if (withFilter)
            {
                memo.HasQueryFilter(m => m.FamilyId == _currentFamily);
            }
            else if (unrelatedFilter)
            {
                memo.HasQueryFilter(m => !m.Archived);
            }

            modelBuilder.Entity<Sticker>();
        }
    }

    /// <summary>EF caches one model per context type; key it on the sample's settings so each test gets its own.</summary>
    private sealed class SampleModelCacheKeyFactory : IModelCacheKeyFactory
    {
        public object Create(DbContext context, bool designTime) =>
            context is SampleContext sample ? (sample.ModelKey, designTime) : (context.GetType(), designTime);
    }
}
