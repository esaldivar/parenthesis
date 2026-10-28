using CoParent.Infrastructure.Email;
using CoParent.Infrastructure.Persistence;
using CoParent.IntegrationTests.Infrastructure;
using CoParent.Modules.Calendar;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
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
    public const string PublicBaseUrl = "https://app.parenthesis.test";

    private const string MigrationsHistoryTable = ModuleDbContextOptions.MigrationsHistoryTable;

    private string _connectionString = null!;

    // A stand-in for the built Angular app, so SPA hosting can be tested without a frontend build.
    private readonly string _webRoot = CreateWebRoot();

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
                // The data-protection key ring isn't test data: keys issued earlier in the run must stay valid.
                TablesToIgnore = [MigrationsHistoryTable, new Respawn.Graph.Table("data_protection", "keys")],
            });
        }
    }

    /// <summary>The API's test database, for building a second host that shares it.</summary>
    public string ConnectionString => _connectionString;

    /// <summary>Runs a scalar query against the API's database, for asserting on data no endpoint exposes (e.g. the audit log).</summary>
    public async Task<T?> QueryScalarAsync<T>(string sql, params (string Name, object Value)[] parameters)
    {
        await using var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        return (T?)await command.ExecuteScalarAsync();
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

    public const string SpaMarker = "parenthesis-test-spa";

    private static string CreateWebRoot()
    {
        var root = Directory.CreateTempSubdirectory("parenthesis-wwwroot-").FullName;
        File.WriteAllText(Path.Combine(root, "index.html"), $"<!doctype html><title>{SpaMarker}</title>");
        File.WriteAllText(Path.Combine(root, "main-ABC123.js"), "console.log('app');");
        return root;
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
        builder.UseWebRoot(_webRoot);
        builder.UseSetting("ConnectionStrings:Postgres", _connectionString);

        // Each session has its own client address (TestClientAddress), but a test may sign in many times; login rate
        // limiting has its own test with a low limit.
        builder.UseSetting("Identity:AuthRateLimit:PermitLimit", "10000");
        builder.UseSetting("App:PublicBaseUrl", PublicBaseUrl);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<FakeEmailSender>();
            services.AddSingleton<IEmailSender>(sp => sp.GetRequiredService<FakeEmailSender>());
            services.AddSingleton<IStartupFilter, TestClientAddress>();

            // The tests' calendar dates are in October 2026 and later: they're checked against a fixed "today" of
            // October 1, 2026 (#232), so they never become "the past". The rest of the app keeps the real clock.
            services.RemoveAllKeyed<TimeProvider>(CalendarModule.TodayClock);
            services.AddKeyedSingleton<TimeProvider>(CalendarModule.TodayClock, new FixedClock(FixedToday));
        });
    }

    /// <summary>The day the calendar's "from today on" rule checks against in tests (noon UTC, October 1, 2026).</summary>
    public static readonly DateTimeOffset FixedToday = new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    private sealed class FixedClock(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
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
