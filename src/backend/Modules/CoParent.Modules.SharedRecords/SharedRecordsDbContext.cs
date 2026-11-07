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

internal sealed class SharedRecordsDbContext(DbContextOptions<SharedRecordsDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "shared_records";
    public DbSet<Fund> Funds => Set<Fund>();
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
    }
}

internal sealed class SharedRecordsDesignTimeFactory : ModuleDesignTimeDbContextFactory<SharedRecordsDbContext>
{
    protected override SharedRecordsDbContext Create(DbContextOptions<SharedRecordsDbContext> options) =>
        new(options, new TenantContext());
}
