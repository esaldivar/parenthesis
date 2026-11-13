using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.SharedRecords.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.SharedRecords.Infrastructure.Persistence;

internal sealed class SharedRecordsDbContext(DbContextOptions<SharedRecordsDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "shared_records";
    public DbSet<Fund> Funds => Set<Fund>();
    public DbSet<SupportRecord> SupportRecords => Set<SupportRecord>();
    public DbSet<Entry> Entries => Set<Entry>();
    private Guid CurrentFamilyId => tenant.FamilyId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<Fund>(fund =>
        {
            fund.ToTable("funds");
            fund.Property(f => f.Title).HasMaxLength(Fund.TitleLimit);
            fund.Property(f => f.Currency).HasMaxLength(3);
            fund.Property(f => f.Status).HasConversion<string>().HasMaxLength(24);
            fund.HasIndex(f => new { f.FamilyId, f.CreatedAt });
            fund.HasQueryFilter(TenantContext.QueryFilterName, f => f.FamilyId == CurrentFamilyId);
        });
        modelBuilder.Entity<SupportRecord>(record =>
        {
            record.ToTable("support_records");
            record.Property(r => r.Title).HasMaxLength(SupportRecord.TitleLimit);
            record.Property(r => r.Currency).HasMaxLength(3);
            record.HasIndex(r => new { r.FamilyId, r.CreatedAt });
            record.HasQueryFilter(TenantContext.QueryFilterName, r => r.FamilyId == CurrentFamilyId);
        });
        modelBuilder.Entity<Entry>(entry =>
        {
            entry.ToTable("entries");
            entry.Property(e => e.RecordKind).HasConversion<string>().HasMaxLength(16);
            entry.Property(e => e.PaidTo).HasConversion<string>().HasMaxLength(16);
            entry.Property(e => e.Status).HasConversion<string>().HasMaxLength(16);
            entry.Property(e => e.AttachmentPath).HasMaxLength(100);
            entry.Property(e => e.AttachmentType).HasMaxLength(32);
            entry.HasIndex(e => new { e.FamilyId, e.RecordId, e.SubmittedAt });
            entry.HasIndex(e => new { e.RecordId, e.ReporterId, e.ClientRequestId }).IsUnique();
            // Removed reports (a closed family) are invisible everywhere; only the cleanup reads them.
            entry.HasQueryFilter(TenantContext.QueryFilterName, e => e.FamilyId == CurrentFamilyId && e.RemovedAt == null);
        });
    }
}

internal sealed class SharedRecordsDesignTimeFactory : ModuleDesignTimeDbContextFactory<SharedRecordsDbContext>
{
    protected override SharedRecordsDbContext Create(DbContextOptions<SharedRecordsDbContext> options) =>
        new(options, new TenantContext());
}
