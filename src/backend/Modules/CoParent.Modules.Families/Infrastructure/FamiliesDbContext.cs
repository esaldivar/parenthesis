using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Families.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// Families and memberships in the <c>families</c> schema. Both are filtered to the request's tenant; the few
/// cross-family reads (a user's own family list, the tenant gate) opt out by filter name, explicitly.
/// </summary>
internal sealed class FamiliesDbContext(DbContextOptions<FamiliesDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "families";

    public DbSet<Family> Families => Set<Family>();

    public DbSet<FamilyMembership> Memberships => Set<FamilyMembership>();

    // Read per query, so each request's filters use its own tenant.
    private Guid CurrentFamilyId => tenant.FamilyId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Family>(family =>
        {
            family.ToTable("families");
            family.Property(f => f.Name).HasMaxLength(Family.NameMaxLength);
            family.Property(f => f.TimeZone).HasMaxLength(64);
            family.HasQueryFilter(TenantContext.QueryFilterName, f => f.Id == CurrentFamilyId);
        });

        modelBuilder.Entity<FamilyMembership>(membership =>
        {
            membership.ToTable("memberships");
            membership.Property(m => m.Role).HasConversion<string>().HasMaxLength(16);
            membership.Property(m => m.Status).HasConversion<string>().HasMaxLength(16);
            membership.HasOne<Family>().WithMany().HasForeignKey(m => m.FamilyId);
            membership.HasIndex(m => new { m.FamilyId, m.UserId }).IsUnique();
            membership.HasIndex(m => m.UserId);
            membership.HasQueryFilter(TenantContext.QueryFilterName, m => m.FamilyId == CurrentFamilyId);
        });
    }
}

internal sealed class FamiliesDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<FamiliesDbContext>
{
    protected override FamiliesDbContext Create(DbContextOptions<FamiliesDbContext> options) => new(options, new TenantContext());
}
