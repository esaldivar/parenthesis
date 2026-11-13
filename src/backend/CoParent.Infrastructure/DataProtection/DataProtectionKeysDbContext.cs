using CoParent.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace CoParent.Infrastructure.DataProtection;

/// <summary>
/// The ASP.NET Core data-protection key ring, in the <c>data_protection</c> schema. Every replica and every restart
/// shares these keys, so sign-in cookies, antiforgery tokens and email links (confirmation, password reset) stay valid
/// when the app scales, wakes from zero or is redeployed. Without it each container makes its own throwaway keys.
/// </summary>
internal sealed class DataProtectionKeysDbContext(DbContextOptions<DataProtectionKeysDbContext> options)
    : DbContext(options), IModuleSchema, IDataProtectionKeyContext
{
    public static string Schema => "data_protection";

    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.Entity<DataProtectionKey>().ToTable("keys");
    }
}

internal sealed class DataProtectionKeysDesignTimeDbContextFactory : ModuleDesignTimeDbContextFactory<DataProtectionKeysDbContext>
{
    protected override DataProtectionKeysDbContext Create(DbContextOptions<DataProtectionKeysDbContext> options) => new(options);
}

public static class DataProtectionServiceCollectionExtensions
{
    /// <summary>The application name ties every replica's keys together; keep it stable across releases.</summary>
    public const string ApplicationName = "Parenthesis";

    /// <summary>
    /// Stores the key ring in PostgreSQL. The context gets its own pooled connection and none of the request
    /// interceptors: key writes aren't part of a request's unit of work or family, and data protection saves
    /// synchronously, which the unit-of-work interceptor rejects. It still migrates with the other schemas.
    /// </summary>
    public static IServiceCollection AddPlatformDataProtection(this IServiceCollection services)
    {
        services.AddDbContext<DataProtectionKeysDbContext>((sp, options) => options
            .UseNpgsql(
                sp.GetRequiredService<NpgsqlDataSource>(),
                npgsql => npgsql.MigrationsHistoryTable(ModuleDbContextOptions.MigrationsHistoryTable, DataProtectionKeysDbContext.Schema))
            .UseSnakeCaseNamingConvention());
        services.AddSingleton(new ModuleDbContextRegistration(typeof(DataProtectionKeysDbContext), DataProtectionKeysDbContext.Schema));
        services.AddDataProtection()
            .SetApplicationName(ApplicationName)
            .PersistKeysToDbContext<DataProtectionKeysDbContext>();
        return services;
    }
}
