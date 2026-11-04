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

    public DbSet<GooglePhotosConnection> GooglePhotosConnections => Set<GooglePhotosConnection>();

    public DbSet<GooglePhotosAlbum> GooglePhotosAlbums => Set<GooglePhotosAlbum>();

    public DbSet<PhotoExport> PhotoExports => Set<PhotoExport>();

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

        // Google Photos export (#404). Deleting a connection deletes its albums and exports; a photo row removed by the
        // cleanup takes its export records with it.
        modelBuilder.Entity<GooglePhotosConnection>(connection =>
        {
            connection.ToTable("google_photos_connections");
            connection.Property(c => c.ProtectedRefreshToken).HasMaxLength(4096);
            connection.Property(c => c.Status).HasConversion<string>().HasMaxLength(16);
            connection.Property(c => c.Problem).HasConversion<string>().HasMaxLength(16);
            connection.Property(c => c.Version).IsRowVersion();
            connection.HasIndex(c => c.MembershipId).IsUnique();
            connection.HasQueryFilter(TenantContext.QueryFilterName, c => c.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<GooglePhotosAlbum>(album =>
        {
            album.ToTable("google_photos_albums");
            album.HasKey(a => new { a.ConnectionId, a.EventId });
            album.Property(a => a.GoogleAlbumId).HasMaxLength(512);
            album.HasOne<GooglePhotosConnection>().WithMany().HasForeignKey(a => a.ConnectionId).OnDelete(DeleteBehavior.Cascade);
            album.HasQueryFilter(TenantContext.QueryFilterName, a => a.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<PhotoExport>(export =>
        {
            export.ToTable("photo_exports");
            export.Property(e => e.State).HasConversion<string>().HasMaxLength(16);
            export.Property(e => e.Reason).HasConversion<string>().HasMaxLength(16);
            export.Property(e => e.UploadToken).HasMaxLength(4096);
            export.Property(e => e.GoogleMediaItemId).HasMaxLength(512);
            export.Property(e => e.Version).IsRowVersion();
            export.Ignore(e => e.Waiting);
            export.HasOne<GooglePhotosConnection>().WithMany().HasForeignKey(e => e.ConnectionId).OnDelete(DeleteBehavior.Cascade);
            export.HasOne<EventPhoto>().WithMany().HasForeignKey(e => e.PhotoId).OnDelete(DeleteBehavior.Cascade);
            export.HasIndex(e => new { e.ConnectionId, e.PhotoId }).IsUnique();
            export.HasIndex(e => new { e.ConnectionId, e.EventId });
            export.HasIndex(e => new { e.State, e.NextAttemptAt });
            export.HasQueryFilter(TenantContext.QueryFilterName, e => e.FamilyId == CurrentFamilyId);
        });
    }
}

internal sealed class MemoriesDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<MemoriesDbContext>
{
    protected override MemoriesDbContext Create(DbContextOptions<MemoriesDbContext> options) => new(options, new TenantContext());
}
