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

    public DbSet<Invitation> Invitations => Set<Invitation>();

    public DbSet<ChildProfile> Children => Set<ChildProfile>();

    public DbSet<Device> Devices => Set<Device>();

    public DbSet<ChildCredential> ChildCredentials => Set<ChildCredential>();

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

        modelBuilder.Entity<Invitation>(invitation =>
        {
            invitation.ToTable("invitations");
            invitation.Property(i => i.Email).HasMaxLength(Invitation.EmailMaxLength);
            invitation.Property(i => i.NormalizedEmail).HasMaxLength(Invitation.EmailMaxLength);
            invitation.Property(i => i.TokenHash).HasMaxLength(32);
            invitation.HasOne<Family>().WithMany().HasForeignKey(i => i.FamilyId);
            invitation.HasIndex(i => i.TokenHash).IsUnique();
            invitation.HasIndex(i => new { i.FamilyId, i.NormalizedEmail });
            invitation.HasQueryFilter(TenantContext.QueryFilterName, i => i.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<ChildProfile>(child =>
        {
            child.ToTable("child_profiles");
            child.Property(c => c.FirstName).HasMaxLength(ChildProfile.FirstNameMaxLength);
            child.Property(c => c.Status).HasConversion<string>().HasMaxLength(16);
            child.HasOne<Family>().WithMany().HasForeignKey(c => c.FamilyId);
            child.HasIndex(c => new { c.FamilyId, c.Status });
            child.HasQueryFilter(TenantContext.QueryFilterName, c => c.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<Device>(device =>
        {
            device.ToTable("devices");
            device.Property(d => d.Kind).HasConversion<string>().HasMaxLength(16);
            device.Property(d => d.Name).HasMaxLength(Device.NameMaxLength);
            device.Property(d => d.TokenHash).HasMaxLength(32);
            device.HasOne<Family>().WithMany().HasForeignKey(d => d.FamilyId);
            device.HasOne<ChildProfile>().WithMany().HasForeignKey(d => d.ChildProfileId);
            device.HasIndex(d => d.TokenHash).IsUnique();
            device.HasIndex(d => d.FamilyId);
            device.HasQueryFilter(TenantContext.QueryFilterName, d => d.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<ChildCredential>(credential =>
        {
            credential.ToTable("child_credentials");
            credential.Property(c => c.PinHash).HasMaxLength(256);
            credential.HasOne<ChildProfile>().WithMany().HasForeignKey(c => c.ChildProfileId);
            credential.HasIndex(c => c.ChildProfileId).IsUnique();
            credential.HasQueryFilter(TenantContext.QueryFilterName, c => c.FamilyId == CurrentFamilyId);
        });
    }
}

internal sealed class FamiliesDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<FamiliesDbContext>
{
    protected override FamiliesDbContext Create(DbContextOptions<FamiliesDbContext> options) => new(options, new TenantContext());
}
