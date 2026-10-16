using CoParent.Infrastructure.Persistence;
using CoParent.IntegrationTests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Respawn;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// The real API host on its own test database: migrations applied once, data reset between tests with Respawn.
/// Runs in the "Testing" environment, so error handling behaves as in production (no developer exception page).
/// </summary>
public sealed class ApiFactory(PostgresFixture postgres) : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string TestingEnvironment = "Testing";

    private const string MigrationsHistoryTable = ModuleDbContextOptions.MigrationsHistoryTable;

    private string _connectionString = null!;

    // Null while no module has tables yet (Respawn refuses an empty database); reset is then a no-op.
    private Respawner? _respawner;

    public async ValueTask InitializeAsync()
    {
        _connectionString = await postgres.CreateDatabaseAsync("api_tests");

        await Services.GetRequiredService<MigrationRunner>().MigrateAsync();

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        if (await HasApplicationTablesAsync(connection))
        {
            _respawner = await Respawner.CreateAsync(connection, new RespawnerOptions
            {
                DbAdapter = DbAdapter.Postgres,
                TablesToIgnore = [MigrationsHistoryTable],
            });
        }
    }

    /// <summary>Deletes all application data, keeping schema and migration history.</summary>
    public async Task ResetDatabaseAsync()
    {
        if (_respawner is null)
        {
            return;
        }

        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await _respawner.ResetAsync(connection);
    }

    private static async Task<bool> HasApplicationTablesAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_type = 'BASE TABLE'
                  AND table_schema NOT IN ('pg_catalog', 'information_schema')
                  AND table_name <> @history)
            """,
            connection);
        command.Parameters.AddWithValue("history", MigrationsHistoryTable);
        return (bool)(await command.ExecuteScalarAsync())!;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(TestingEnvironment);
        builder.UseSetting("ConnectionStrings:Postgres", _connectionString);
        builder.ConfigureServices(services => services.AddSingleton<IStartupFilter, ThrowingEndpointStartupFilter>());
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        GC.SuppressFinalize(this);
    }
}

/// <summary>All API test classes share one host and one database, so they run one at a time.</summary>
[CollectionDefinition(Name)]
public sealed class ApiCollectionDefinition : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
