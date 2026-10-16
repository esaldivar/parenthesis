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
        services.AddScoped<UnitOfWorkEnlistmentInterceptor>();
        services.AddSingleton<MigrationRunner>();
        services.AddSingleton(TimeProvider.System);
        return services;
    }

    /// <summary>
    /// Registers a module DbContext on the shared connection, joined to the unit of work, with its own migrations
    /// history table and snake_case naming. Registration order is migration order.
    /// </summary>
    public static IServiceCollection AddModuleDbContext<TContext>(this IServiceCollection services)
        where TContext : DbContext, IModuleSchema
    {
        services.AddDbContext<TContext>((sp, options) => options
            .UseModuleDefaults<TContext>(sp.GetRequiredService<NpgsqlConnection>())
            .AddInterceptors(sp.GetRequiredService<UnitOfWorkEnlistmentInterceptor>()));

        services.AddSingleton(new ModuleDbContextRegistration(typeof(TContext), TContext.Schema));
        return services;
    }
}
