using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CoParent.Infrastructure.Persistence;

/// <summary>Records a module DbContext in registration order, which is also the migration order.</summary>
public sealed record ModuleDbContextRegistration(Type ContextType, string Schema);

/// <summary>Applies every module's EF Core migrations, in registration order.</summary>
public sealed partial class MigrationRunner(
    IServiceScopeFactory scopeFactory,
    IEnumerable<ModuleDbContextRegistration> registrations,
    ILogger<MigrationRunner> logger)
{
    public async Task MigrateAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var count = 0;

        foreach (var registration in registrations)
        {
            var context = (DbContext)scope.ServiceProvider.GetRequiredService(registration.ContextType);
            var pending = (await context.Database.GetPendingMigrationsAsync(cancellationToken)).Count();

            LogMigrating(registration.Schema, pending);
            await context.Database.MigrateAsync(cancellationToken);
            count++;
        }

        LogCompleted(count);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Migrating schema {Schema}: {Pending} pending migration(s)")]
    private partial void LogMigrating(string schema, int pending);

    [LoggerMessage(Level = LogLevel.Information, Message = "Migrations complete for {ModuleCount} module(s)")]
    private partial void LogCompleted(int moduleCount);
}
