using Npgsql;
using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(CoParent.IntegrationTests.Infrastructure.PostgresFixture))]

namespace CoParent.IntegrationTests.Infrastructure;

/// <summary>One PostgreSQL container for the whole test run, on the same image as compose.yaml.</summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17.11-alpine").Build();

    public string ConnectionString => _container.GetConnectionString();

    /// <summary>
    /// Creates a separate database in the shared container, so suites that reset data (Respawn) can't wipe
    /// tables that another suite is using in parallel.
    /// </summary>
    public async Task<string> CreateDatabaseAsync(string name)
    {
        await using var connection = new NpgsqlConnection(ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", connection);
        await command.ExecuteNonQueryAsync();

        return new NpgsqlConnectionStringBuilder(ConnectionString) { Database = name }.ConnectionString;
    }

    public async ValueTask InitializeAsync() => await _container.StartAsync();

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();
}
