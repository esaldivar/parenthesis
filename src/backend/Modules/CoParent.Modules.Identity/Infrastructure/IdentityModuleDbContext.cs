using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Identity.Infrastructure;

/// <summary>ASP.NET Core Identity's user store, in the <c>identity</c> schema. No roles: authority comes from family membership.</summary>
internal sealed class IdentityModuleDbContext(DbContextOptions<IdentityModuleDbContext> options)
    : IdentityUserContext<AppUser, Guid>(options), IModuleSchema
{
    public static string Schema => "identity";

    protected override void OnModelCreating(ModelBuilder builder)
    {
        builder.HasDefaultSchema(Schema);
        base.OnModelCreating(builder);

        builder.Entity<AppUser>(user =>
        {
            user.ToTable("users");
            user.Property(u => u.DisplayName).HasMaxLength(AppUser.DisplayNameMaxLength);
            user.Property(u => u.UserType).HasConversion<string>().HasMaxLength(16);
        });
        builder.Entity<IdentityUserClaim<Guid>>().ToTable("user_claims");
        builder.Entity<IdentityUserLogin<Guid>>().ToTable("user_logins");
        builder.Entity<IdentityUserToken<Guid>>().ToTable("user_tokens");
    }
}

internal sealed class IdentityModuleDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<IdentityModuleDbContext>
{
    protected override IdentityModuleDbContext Create(DbContextOptions<IdentityModuleDbContext> options) => new(options);
}
