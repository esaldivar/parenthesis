using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace CoParent.Infrastructure.Persistence;

/// <summary>
/// Implemented by every module DbContext: the module's schema, used for its tables (via
/// <c>HasDefaultSchema</c>) and its migrations history table. Architecture tests check both.
/// </summary>
public interface IModuleSchema
{
    static abstract string Schema { get; }
}

public static class ModuleDbContextOptions
{
    public const string MigrationsHistoryTable = "__ef_migrations_history";

    /// <summary>Npgsql, per-schema migrations history and snake_case names: the same at runtime and design time.</summary>
    public static DbContextOptionsBuilder UseModuleDefaults<TContext>(this DbContextOptionsBuilder options, DbConnection connection)
        where TContext : DbContext, IModuleSchema => options
        .UseNpgsql(connection, npgsql => npgsql.MigrationsHistoryTable(MigrationsHistoryTable, TContext.Schema))
        .UseSnakeCaseNamingConvention();
}

/// <summary>
/// Lets <c>dotnet ef migrations add</c> build a module's context without starting the host. The connection is
/// never opened when adding migrations.
/// </summary>
public abstract class ModuleDesignTimeDbContextFactory<TContext> : IDesignTimeDbContextFactory<TContext>
    where TContext : DbContext, IModuleSchema
{
    public TContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<TContext>();
        options.UseModuleDefaults<TContext>(new Npgsql.NpgsqlConnection("Host=localhost;Database=design_time"));
        return Create(options.Options);
    }

    protected abstract TContext Create(DbContextOptions<TContext> options);
}
