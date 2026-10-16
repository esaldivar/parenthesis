using CoParent.Infrastructure.Auditing;
using CoParent.Infrastructure.Tenancy;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace CoParent.Infrastructure.Persistence;

public static class PersistenceServiceCollectionExtensions
{
    /// <summary>
    /// One pooled <see cref="NpgsqlDataSource"/>, one <see cref="NpgsqlConnection"/> per scope shared by every
    /// module DbContext, the scope's <see cref="IUnitOfWork"/> and tenant, the audit log, the migration runner and
    /// <see cref="TimeProvider"/>.
    /// </summary>
    public static IServiceCollection AddPersistence(this IServiceCollection services, string connectionString)
    {
        services.AddNpgsqlDataSource(connectionString);
        services.AddScoped(sp => sp.GetRequiredService<NpgsqlDataSource>().CreateConnection());
        services.AddScoped<UnitOfWork>();
        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<UnitOfWork>());
        services.AddScoped<UnitOfWorkEnlistmentInterceptor>();
        services.AddScoped<TenantContext>();
        services.AddScoped<ITenantContext>(sp => sp.GetRequiredService<TenantContext>());
        services.AddScoped<TenantWriteGuardInterceptor>();
        services.AddSingleton<MigrationRunner>();
        services.AddSingleton(TimeProvider.System);

        // The audit schema migrates first: every module may write to it.
        services.AddModuleDbContext<AuditDbContext>();
        services.AddScoped<IAuditLog, AuditLog>();
        return services;
    }

    /// <summary>
    /// Registers a module DbContext on the shared connection with the unit-of-work and tenant write-guard
    /// interceptors, its own migrations history table and snake_case naming. Registration order is migration order.
    /// </summary>
    public static IServiceCollection AddModuleDbContext<TContext>(this IServiceCollection services)
        where TContext : DbContext, IModuleSchema
    {
        services.AddDbContext<TContext>((sp, options) => options
            .UseModuleDefaults<TContext>(sp.GetRequiredService<NpgsqlConnection>())
            .AddInterceptors(
                sp.GetRequiredService<UnitOfWorkEnlistmentInterceptor>(),
                sp.GetRequiredService<TenantWriteGuardInterceptor>()));

        services.AddSingleton(new ModuleDbContextRegistration(typeof(TContext), TContext.Schema));
        return services;
    }
}
