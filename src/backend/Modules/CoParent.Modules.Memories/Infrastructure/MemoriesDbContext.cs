using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Memories.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Memories.Infrastructure;

/// <summary>Event photos and Family Memories (#403) in the <c>memories</c> schema, filtered to the request's family.</summary>
internal sealed class MemoriesDbContext(DbContextOptions<MemoriesDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "memories";

    public DbSet<PhotoBatch> Batches => Set<PhotoBatch>();

    public DbSet<EventPhoto> Photos => Set<EventPhoto>();

    public DbSet<MemorySettings> Settings => Set<MemorySettings>();

    // Read per query, so each request's filters use its own tenant.
    private Guid CurrentFamilyId => tenant.FamilyId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<PhotoBatch>(batch =>
        {
            batch.ToTable("photo_batches");
            batch.Property(b => b.Version).IsRowVersion();
            batch.HasIndex(b => new { b.FamilyId, b.EventId });
            batch.HasQueryFilter(TenantContext.QueryFilterName, b => b.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<EventPhoto>(photo =>
        {
            photo.ToTable("event_photos");
            photo.Property(p => p.State).HasConversion<string>().HasMaxLength(16);
            photo.Property(p => p.Version).IsRowVersion();
            photo.Ignore(p => p.StoredBytes);
            photo.Ignore(p => p.PhotoPath);
            photo.Ignore(p => p.ThumbnailPath);
            photo.HasOne<PhotoBatch>().WithMany().HasForeignKey(p => p.BatchId);
            photo.HasIndex(p => new { p.FamilyId, p.EventId, p.UploaderMembershipId, p.State });
            photo.HasIndex(p => new { p.FamilyId, p.UploaderMembershipId, p.State });
            photo.HasIndex(p => new { p.State, p.ExpiresAt });
            photo.HasQueryFilter(TenantContext.QueryFilterName, p => p.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<MemorySettings>(settings =>
        {
            settings.ToTable("memory_settings");
            settings.HasKey(s => s.MembershipId);
            settings.HasQueryFilter(TenantContext.QueryFilterName, s => s.FamilyId == CurrentFamilyId);
        });
    }
}

internal sealed class MemoriesDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<MemoriesDbContext>
{
    protected override MemoriesDbContext Create(DbContextOptions<MemoriesDbContext> options) => new(options, new TenantContext());
}
