using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Calendar.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Infrastructure;

/// <summary>Calendar events, reminders and tasks in the <c>calendar</c> schema, filtered to the request's tenant.</summary>
internal sealed class CalendarDbContext(DbContextOptions<CalendarDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "calendar";

    public DbSet<CalendarEvent> Events => Set<CalendarEvent>();

    public DbSet<EventDismissal> Dismissals => Set<EventDismissal>();

    public DbSet<CalendarSeries> Series => Set<CalendarSeries>();

    public DbSet<Reminder> Reminders => Set<Reminder>();

    public DbSet<ReminderHistory> ReminderHistory => Set<ReminderHistory>();

    public DbSet<ReminderSeen> ReminderSeen => Set<ReminderSeen>();

    public DbSet<SharedTask> Tasks => Set<SharedTask>();

    public DbSet<SharedTaskHistory> TaskHistory => Set<SharedTaskHistory>();

    public DbSet<SharedTaskSeen> TaskSeen => Set<SharedTaskSeen>();

    public DbSet<TaskChecklistItem> TaskItems => Set<TaskChecklistItem>();

    public DbSet<GoogleCalendarConnection> GoogleConnections => Set<GoogleCalendarConnection>();

    public DbSet<GoogleSyncedEvent> GoogleSyncedEvents => Set<GoogleSyncedEvent>();

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
            e.Property(x => x.PendingChange).HasConversion<string>().HasMaxLength(16);
            e.OwnsOne(x => x.Proposed, p =>
            {
                p.Property(x => x.Title).HasMaxLength(CalendarEvent.TitleMaxLength);
                p.Property(x => x.Location).HasMaxLength(CalendarEvent.LocationMaxLength);
            });
            e.HasIndex(x => new { x.FamilyId, x.StartsAt });
            e.HasIndex(x => new { x.SeriesId, x.StartsAt });
            // Search (#253) pages through a family's past events by when they ended.
            e.HasIndex(x => new { x.FamilyId, x.EndsAt });
            e.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<CalendarSeries>(r =>
        {
            r.ToTable("series");
            r.Property(x => x.Category).HasConversion<string>().HasMaxLength(24);
            r.Property(x => x.Frequency).HasConversion<string>().HasMaxLength(16);
            r.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<Reminder>(r =>
        {
            r.ToTable("reminders");
            r.Property(x => x.Title).HasMaxLength(Reminder.TitleMaxLength);
            r.Property(x => x.Details).HasMaxLength(Reminder.DetailsMaxLength);
            r.Property(x => x.Repeat).HasConversion<string>().HasMaxLength(16);
            r.HasIndex(x => new { x.FamilyId, x.StartsAt });
            r.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<ReminderHistory>(h =>
        {
            h.ToTable("reminder_history");
            h.Property(x => x.Action).HasConversion<string>().HasMaxLength(16);
            h.Property(x => x.Changes).HasMaxLength(Domain.ReminderHistory.ChangesMaxLength);
            h.HasIndex(x => new { x.ReminderId, x.At });
            h.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<ReminderSeen>(s =>
        {
            s.ToTable("reminder_seen");
            s.HasKey(x => new { x.ReminderId, x.MembershipId });
            s.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<SharedTask>(t =>
        {
            t.ToTable("tasks");
            t.Property(x => x.Title).HasMaxLength(SharedTask.TitleMaxLength);
            t.Property(x => x.Details).HasMaxLength(SharedTask.DetailsMaxLength);
            t.Property(x => x.Version).IsRowVersion();
            t.HasIndex(x => new { x.FamilyId, x.DueDate });
            t.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<TaskChecklistItem>(i =>
        {
            i.ToTable("task_checklist_items");
            i.Property(x => x.Text).HasMaxLength(TaskChecklistItem.TextMaxLength);
            i.HasIndex(x => new { x.TaskId, x.Position });
            i.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<SharedTaskHistory>(h =>
        {
            h.ToTable("task_history");
            h.Property(x => x.Action).HasConversion<string>().HasMaxLength(16);
            h.Property(x => x.Changes).HasMaxLength(SharedTaskHistory.ChangesMaxLength);
            h.HasIndex(x => new { x.TaskId, x.At });
            h.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<SharedTaskSeen>(s =>
        {
            s.ToTable("task_seen");
            s.HasKey(x => new { x.TaskId, x.MembershipId });
            s.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<EventDismissal>(d =>
        {
            d.ToTable("event_dismissals");
            d.HasKey(x => new { x.EventId, x.MembershipId });
            d.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<GoogleCalendarConnection>(g =>
        {
            g.ToTable("google_connections");
            g.Property(x => x.GoogleCalendarId).HasMaxLength(GoogleCalendarConnection.CalendarIdMaxLength);
            g.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            g.Property(x => x.Problem).HasConversion<string>().HasMaxLength(24);
            // One connection per parent per family.
            g.HasIndex(x => new { x.FamilyId, x.MembershipId }).IsUnique();
            g.HasIndex(x => x.Status);
            g.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<GoogleSyncedEvent>(s =>
        {
            s.ToTable("google_synced_events");
            s.HasKey(x => new { x.ConnectionId, x.EventId });
            s.Property(x => x.Hash).HasMaxLength(GoogleSyncedEvent.HashLength).IsFixedLength();
            s.HasOne<GoogleCalendarConnection>().WithMany().HasForeignKey(x => x.ConnectionId).OnDelete(DeleteBehavior.Cascade);
            s.HasQueryFilter(TenantContext.QueryFilterName, x => x.FamilyId == CurrentFamilyId);
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
