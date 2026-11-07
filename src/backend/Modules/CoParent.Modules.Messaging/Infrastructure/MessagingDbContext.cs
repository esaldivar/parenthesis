using CoParent.Infrastructure.Persistence;
using CoParent.Infrastructure.Tenancy;
using CoParent.Modules.Messaging.Domain;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Messaging.Infrastructure;

/// <summary>Parent-to-parent messages (#125) in the <c>messaging</c> schema, filtered to the request's family.</summary>
internal sealed class MessagingDbContext(DbContextOptions<MessagingDbContext> options, ITenantContext tenant)
    : DbContext(options), IModuleSchema
{
    public static string Schema => "messaging";

    public DbSet<ChatMessage> Messages => Set<ChatMessage>();

    public DbSet<ReadPosition> ReadPositions => Set<ReadPosition>();

    public DbSet<ChatTranscript> Transcripts => Set<ChatTranscript>();

    // Read per query, so each request's filters use its own tenant.
    private Guid CurrentFamilyId => tenant.FamilyId;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<ChatMessage>(message =>
        {
            message.ToTable("messages");
            message.Property(m => m.Text).HasMaxLength(ChatMessage.TextMaxLength);
            // A retried send finds the message it already stored (see ChatMessage.ClientMessageId).
            message.HasIndex(m => new { m.FamilyId, m.SenderMembershipId, m.ClientMessageId }).IsUnique();
            message.Property(m => m.Sequence).UseIdentityAlwaysColumn();
            message.HasIndex(m => m.Sequence).IsUnique();
            message.HasIndex(m => new { m.FamilyId, m.Sequence });
            message.Property(m => m.EventId);
            message.HasQueryFilter(TenantContext.QueryFilterName, m => m.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<ChatTranscript>(transcript =>
        {
            transcript.ToTable("transcripts");
            transcript.Property(t => t.FileName).HasMaxLength(ChatTranscript.FileNameMaxLength);
            transcript.Property(t => t.RangeLabel).HasMaxLength(ChatTranscript.RangeLabelMaxLength);
            transcript.HasIndex(t => new { t.FamilyId, t.OwnerMembershipId, t.CreatedAt });
            transcript.HasQueryFilter(TenantContext.QueryFilterName, t => t.FamilyId == CurrentFamilyId);
        });

        modelBuilder.Entity<ReadPosition>(position =>
        {
            position.ToTable("read_positions");
            position.HasKey(p => p.MembershipId);
            position.HasIndex(p => p.FamilyId);
            position.HasQueryFilter(TenantContext.QueryFilterName, p => p.FamilyId == CurrentFamilyId);
        });
    }
}

internal sealed class MessagingDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<MessagingDbContext>
{
    protected override MessagingDbContext Create(DbContextOptions<MessagingDbContext> options) => new(options, new TenantContext());
}
