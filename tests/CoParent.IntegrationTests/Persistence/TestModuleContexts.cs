using CoParent.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace CoParent.IntegrationTests.Persistence;

public sealed class Note
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public required string Text { get; set; }
}

/// <summary>Two stand-in modules, each with its own schema, to exercise cross-module units of work.</summary>
public sealed class AlphaDbContext(DbContextOptions<AlphaDbContext> options, UnitOfWork unitOfWork)
    : ModuleDbContext(options, unitOfWork), IModuleSchema
{
    public static string Schema => "test_alpha";

    public DbSet<Note> Notes => Set<Note>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.HasDefaultSchema(Schema).Entity<Note>();
}

public sealed class BetaDbContext(DbContextOptions<BetaDbContext> options, UnitOfWork unitOfWork)
    : ModuleDbContext(options, unitOfWork), IModuleSchema
{
    public static string Schema => "test_beta";

    public DbSet<Note> Notes => Set<Note>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.HasDefaultSchema(Schema).Entity<Note>();
}
