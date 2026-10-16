using Testcontainers.PostgreSql;

[assembly: AssemblyFixture(typeof(CoParent.IntegrationTests.Infrastructure.PostgresFixture))]

namespace CoParent.IntegrationTests.Infrastructure;

/// <summary>One PostgreSQL container for the whole test run, on the same image as compose.yaml.</summary>
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17.11-alpine").Build();

    public string ConnectionString => _container.GetConnectionString();

    public async ValueTask InitializeAsync() => await _container.StartAsync();

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();
}
