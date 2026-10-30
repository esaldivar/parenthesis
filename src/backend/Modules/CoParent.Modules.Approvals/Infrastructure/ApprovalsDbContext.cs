using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Approvals.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Approvals.Infrastructure;

/// <summary>Change requests and decisions in the <c>approvals</c> schema, filtered to the request's tenant.</summary>
internal sealed class ApprovalsDbContext(DbContextOptions<ApprovalsDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "approvals";

    public DbSet<ChangeRequest> ChangeRequests => Set<ChangeRequest>();

    public DbSet<ApprovalDecision> Decisions => Set<ApprovalDecision>();

    private Guid CurrentFamilyId => tenant.FamilyId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<ChangeRequest>(request =>
        {
            request.ToTable("change_requests");
            request.Property(r => r.Type).HasMaxLength(40);
            request.Property(r => r.TargetType).HasMaxLength(40);
            request.Property(r => r.Summary).HasMaxLength(ChangeRequest.SummaryMaxLength);
            request.Property(r => r.Reason).HasMaxLength(ChangeRequest.ReasonMaxLength);
            request.Property(r => r.Status).HasConversion<string>().HasMaxLength(16);
            request.Property(r => r.Version).IsRowVersion();
            request.HasMany(r => r.Decisions).WithOne().HasForeignKey(d => d.ChangeRequestId);
            request.Navigation(r => r.Decisions).AutoInclude();

            // At most one open request per target, so parents never face conflicting parallel proposals.
            request.HasIndex(r => new { r.TargetType, r.TargetId })
                .IsUnique()
                .HasFilter("status = 'Pending'");
            request.HasIndex(r => new { r.FamilyId, r.Status, r.CreatedAt });
            request.HasQueryFilter(TenantContext.QueryFilterName, r => r.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<ApprovalDecision>(decision =>
        {
            decision.ToTable("approval_decisions");
            decision.Property(d => d.Decision).HasConversion<string>().HasMaxLength(16);
            decision.Property(d => d.Comment).HasMaxLength(ApprovalDecision.CommentMaxLength);
            decision.HasIndex(d => new { d.ChangeRequestId, d.DeciderMembershipId }).IsUnique();
        });
    }
}

internal sealed class ApprovalsDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<ApprovalsDbContext>
{
    protected override ApprovalsDbContext Create(DbContextOptions<ApprovalsDbContext> options) => new(options, new TenantContext());
}
