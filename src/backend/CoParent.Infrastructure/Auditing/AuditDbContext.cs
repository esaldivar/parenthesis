using CoParent.Infrastructure.Persistence;
using CoParent.SharedKernel.Auditing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Infrastructure.Auditing;

internal sealed class AuditRecord
{
    public long Id { get; set; }

    public Guid? FamilyId { get; set; }

    public Guid? ActorUserId { get; set; }

    public required string Action { get; set; }

    public required string ResourceType { get; set; }

    public Guid? ResourceId { get; set; }

    public DateTimeOffset OccurredAt { get; set; }
}

/// <summary>The audit trail, in the <c>audit</c> schema. Rows are only ever inserted.</summary>
internal sealed class AuditDbContext(DbContextOptions<AuditDbContext> options) : DbContext(options), IModuleSchema
{
    public static string Schema => "audit";

    public DbSet<AuditRecord> Records => Set<AuditRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<AuditRecord>(record =>
        {
            record.ToTable("audit_log");
            record.Property(r => r.Id).UseIdentityAlwaysColumn();
            record.Property(r => r.Action).HasMaxLength(100);
            record.Property(r => r.ResourceType).HasMaxLength(100);
            record.HasIndex(r => new { r.FamilyId, r.OccurredAt });
        });
    }
}

internal sealed class AuditDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<AuditDbContext>
{
    protected override AuditDbContext Create(DbContextOptions<AuditDbContext> options) => new(options);
}

internal sealed class AuditLog(AuditDbContext db, TimeProvider clock) : IAuditLog
{
    public async Task RecordAsync(AuditEntry entry, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(entry);
        db.Records.Add(new AuditRecord
        {
            FamilyId = entry.FamilyId,
            ActorUserId = entry.ActorUserId,
            Action = entry.Action,
            ResourceType = entry.ResourceType,
            ResourceId = entry.ResourceId,
            OccurredAt = clock.GetUtcNow(),
        });
        await db.SaveChangesAsync(cancellationToken);
    }
}
