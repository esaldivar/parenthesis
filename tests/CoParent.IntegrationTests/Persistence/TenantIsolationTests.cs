using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.IntegrationTests.Infrastructure;
using CoParent.SharedKernel.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.IntegrationTests.Persistence;

public sealed class ScopedNote : IFamilyScoped
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid FamilyId { get; set; }

    public required string Text { get; set; }
}

/// <summary>A stand-in module with a family-scoped entity, configured the way real modules are (ADR-0002).</summary>
public sealed class GammaDbContext(DbContextOptions<GammaDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "test_gamma";

    public DbSet<ScopedNote> Notes => Set<ScopedNote>();

    private Guid CurrentFamilyId => tenant.FamilyId;

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.HasDefaultSchema(Schema).Entity<ScopedNote>()
            .HasQueryFilter(TenantContext.QueryFilterName, n => n.FamilyId == CurrentFamilyId);
}

/// <summary>Layers 2 and 3 of tenant isolation: the query filter and the write guard, below the tenant gate.</summary>
public sealed class TenantIsolationTests(PostgresFixture postgres) : IAsyncLifetime
{
    private readonly Guid _familyA = Guid.CreateVersion7();
    private readonly Guid _familyB = Guid.CreateVersion7();
    private ServiceProvider _services = null!;

    public async ValueTask InitializeAsync()
    {
        _services = new ServiceCollection()
            .AddLogging()
            .AddPersistence(postgres.ConnectionString)
            .AddModuleDbContext<GammaDbContext>()
            .BuildServiceProvider(validateScopes: true);

        await using var scope = _services.CreateAsyncScope();
        try
        {
            await scope.ServiceProvider.GetRequiredService<GammaDbContext>().GetService<IRelationalDatabaseCreator>().CreateTablesAsync();
        }
        catch (Npgsql.PostgresException e) when (e.SqlState == Npgsql.PostgresErrorCodes.DuplicateTable)
        {
        }
    }

    public ValueTask DisposeAsync() => _services.DisposeAsync();

    [Fact]
    public async Task Write_without_a_resolved_tenant_is_blocked()
    {
        await using var scope = _services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GammaDbContext>();

        db.Notes.Add(new ScopedNote { FamilyId = _familyA, Text = "no tenant" });

        await Assert.ThrowsAsync<CrossTenantWriteException>(() => db.SaveChangesAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Write_into_another_family_is_blocked()
    {
        await using var scope = _services.CreateAsyncScope();
        var db = InTenant(scope, _familyA);

        db.Notes.Add(new ScopedNote { FamilyId = _familyB, Text = "wrong family" });

        await Assert.ThrowsAsync<CrossTenantWriteException>(() => db.SaveChangesAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Moving_a_row_to_another_family_is_blocked()
    {
        var note = await InsertAsync(_familyA, "movable");

        await using var scope = _services.CreateAsyncScope();
        var db = InTenant(scope, _familyA);
        var tracked = await db.Notes.SingleAsync(n => n.Id == note.Id, TestContext.Current.CancellationToken);
        tracked.FamilyId = _familyB;

        await Assert.ThrowsAsync<CrossTenantWriteException>(() => db.SaveChangesAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Queries_only_see_the_current_familys_rows()
    {
        var a = await InsertAsync(_familyA, "family A");
        var b = await InsertAsync(_familyB, "family B");

        await using var scopeA = _services.CreateAsyncScope();
        var visibleToA = await InTenant(scopeA, _familyA).Notes.Select(n => n.Id).ToListAsync(TestContext.Current.CancellationToken);

        await using var unresolved = _services.CreateAsyncScope();
        var visibleWithoutTenant = await unresolved.ServiceProvider.GetRequiredService<GammaDbContext>().Notes
            .CountAsync(TestContext.Current.CancellationToken);

        Assert.Contains(a.Id, visibleToA);
        Assert.DoesNotContain(b.Id, visibleToA);
        Assert.Equal(0, visibleWithoutTenant);
    }

    private static GammaDbContext InTenant(AsyncServiceScope scope, Guid familyId)
    {
        scope.ServiceProvider.GetRequiredService<TenantContext>().Resolve(familyId, Guid.CreateVersion7(), FamilyRole.Parent);
        return scope.ServiceProvider.GetRequiredService<GammaDbContext>();
    }

    private async Task<ScopedNote> InsertAsync(Guid familyId, string text)
    {
        await using var scope = _services.CreateAsyncScope();
        var db = InTenant(scope, familyId);
        var note = new ScopedNote { FamilyId = familyId, Text = text };
        db.Notes.Add(note);
        await db.SaveChangesAsync(TestContext.Current.CancellationToken);
        return note;
    }
}
