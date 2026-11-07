using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.SharedKernel.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.SharedRecords;

internal enum FundStatus
{
    AwaitingAgreement,
    Open,
    ProposalEnded,
}

internal sealed class Fund : IFamilyScoped
{
    public const int TitleLimit = 120;
    public const long ShareLimit = 99_999_999_999_999;

    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid FamilyId { get; init; }
    public required Guid ProposerId { get; init; }
    public required Guid CoParentId { get; init; }
    public required string Title { get; init; }
    public required string Currency { get; init; }
    public required long ProposerShareMinor { get; init; }
    public required long CoParentShareMinor { get; init; }
    public required Guid[] ChildIds { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public Guid ApprovalId { get; set; }
    public FundStatus Status { get; set; }
}

/// <summary>What a report belongs to: an agreed Shared Fund or a one-time Child Support record.</summary>
internal enum RecordKind
{
    Fund,
    Support,
}

/// <summary>Who received the money: a vendor (the other parent acknowledges it) or the other parent (they confirm receipt).</summary>
internal enum PaidTo
{
    Vendor,
    CoParent,
}

internal enum EntryStatus
{
    Pending,
    Acknowledged,
    Disputed,
}

/// <summary>
/// A one-time Child Support record (#477): a shared copy of payments one parent reports making through the applicable
/// official channel, and the other parent's confirmation. It has no schedule, balance or legal meaning. The reference
/// amount is optional and only shows progress.
/// </summary>
internal sealed class SupportRecord : IFamilyScoped
{
    public const int TitleLimit = 120;

    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid FamilyId { get; init; }
    public required string Title { get; init; }
    public required string Currency { get; init; }
    public required Guid PayerId { get; init; }
    public required Guid RecipientId { get; init; }
    public long? ReferenceMinor { get; init; }
    public required Guid CreatedById { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
}

/// <summary>
/// One reported contribution (to a Shared Fund) or payment (on a Child Support record), with its required attachment.
/// The report stays as submitted: the other parent acknowledges it or flags a mismatch, and a correction is a new report.
/// </summary>
internal sealed class Entry : IFamilyScoped
{
    public const int MaxAttachmentBytes = 10 * 1024 * 1024;

    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid FamilyId { get; init; }
    public required RecordKind RecordKind { get; init; }
    public required Guid RecordId { get; init; }
    public required Guid ReporterId { get; init; }
    public required Guid ResponderId { get; init; }
    public required long AmountMinor { get; init; }
    public required DateOnly PaidOn { get; init; }
    public required PaidTo PaidTo { get; init; }
    public required DateTimeOffset SubmittedAt { get; init; }
    /// <summary>The browser's id for this submission, so a retried or repeated submit records it once.</summary>
    public required Guid ClientRequestId { get; init; }
    public required string AttachmentPath { get; init; }
    public required string AttachmentType { get; init; }
    public required int AttachmentBytes { get; init; }
    public EntryStatus Status { get; set; }
    public DateTimeOffset? RespondedAt { get; set; }
}

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
            entry.HasQueryFilter(TenantContext.QueryFilterName, e => e.FamilyId == CurrentFamilyId);
        });
    }
}

internal sealed class SharedRecordsDesignTimeFactory : ModuleDesignTimeDbContextFactory<SharedRecordsDbContext>
{
    protected override SharedRecordsDbContext Create(DbContextOptions<SharedRecordsDbContext> options) =>
        new(options, new TenantContext());
}
