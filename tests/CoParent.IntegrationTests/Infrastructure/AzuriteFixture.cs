using Testcontainers.Azurite;

[assembly: AssemblyFixture(typeof(CoParent.IntegrationTests.Infrastructure.AzuriteFixture))]

namespace CoParent.IntegrationTests.Infrastructure;

/// <summary>One Azurite blob emulator for the whole test run (event photos, #403), on the same image as compose.yaml.</summary>
public sealed class AzuriteFixture : IAsyncLifetime
{
    private readonly AzuriteContainer _container = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:3.37.0")
        .WithCommand("--skipApiVersionCheck", "--loose")
        .Build();

    public string ConnectionString => _container.GetConnectionString();

    public async ValueTask InitializeAsync() => await _container.StartAsync();

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();
}
