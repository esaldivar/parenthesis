using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Calendar.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>Calendar events in the <c>calendar</c> schema, filtered to the request's tenant.</summary>
internal sealed class CalendarDbContext(DbContextOptions<CalendarDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "calendar";

    public DbSet<CalendarEvent> Events => Set<CalendarEvent>();

    private Guid CurrentFamilyId => tenant.FamilyId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<CalendarEvent>(e =>
        {
            e.ToTable("events");
            e.Property(x => x.Title).HasMaxLength(CalendarEvent.TitleMaxLength);
            e.Property(x => x.Location).HasMaxLength(CalendarEvent.LocationMaxLength);
            e.Property(x => x.Notes).HasMaxLength(CalendarEvent.NotesMaxLength);
            e.Property(x => x.Category).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            e.Property(x => x.Version).IsRowVersion();
            e.HasMany(x => x.Children).WithOne().HasForeignKey(c => c.EventId);
            e.Navigation(x => x.Children).AutoInclude();
            e.HasIndex(x => new { x.FamilyId, x.StartsAt });
            e.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<EventChild>(c =>
        {
            c.ToTable("event_children");
            c.HasKey(x => new { x.EventId, x.ChildProfileId });
            c.HasIndex(x => x.ChildProfileId);
            c.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });
    }
}

internal sealed class CalendarDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<CalendarDbContext>
{
    protected override CalendarDbContext Create(DbContextOptions<CalendarDbContext> options) => new(options, new TenantContext());
}
