using CoParent.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace CoParent.Infrastructure.Persistence;

public static class PersistenceServiceCollectionExtensions
{
    /// <summary>
    /// One pooled <see cref="NpgsqlDataSource"/>, one <see cref="NpgsqlConnection"/> per scope shared by every
    /// module DbContext, the scope's <see cref="IUnitOfWork"/>, the migration runner and <see cref="TimeProvider"/>.
    /// </summary>
    public static IServiceCollection AddPersistence(this IServiceCollection services, string connectionString)
    {
        services.AddNpgsqlDataSource(connectionString);
        services.AddScoped(sp => sp.GetRequiredService<NpgsqlDataSource>().CreateConnection());
        services.AddScoped<UnitOfWork>();
        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<UnitOfWork>());
        services.AddSingleton<MigrationRunner>();
        services.AddSingleton(TimeProvider.System);
        return services;
    }

    /// <summary>
    /// Registers a module DbContext on the shared connection, with its own schema, its own migrations history
    /// table and snake_case naming. Registration order is migration order.
    /// </summary>
    public static IServiceCollection AddModuleDbContext<TContext>(this IServiceCollection services)
        where TContext : ModuleDbContext, IModuleSchema
    {
        services.AddDbContext<TContext>((sp, options) => options
            .UseNpgsql(
                sp.GetRequiredService<NpgsqlConnection>(),
                npgsql => npgsql.MigrationsHistoryTable("__ef_migrations_history", TContext.Schema))
            .UseSnakeCaseNamingConvention());

        services.AddSingleton(new ModuleDbContextRegistration(typeof(TContext), TContext.Schema));
        return services;
    }
}
