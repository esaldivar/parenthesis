using CoParent.Infrastructure.DataProtection;
using CoParent.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.IntegrationTests.Api;

[Collection(ApiCollectionDefinition.Name)]
public sealed class DataProtectionKeyRingTests(ApiFactory api)
{
    private const string Purpose = "CoParent.IntegrationTests.KeyRing";

    [Fact]
    public async Task Keys_are_stored_in_the_database()
    {
        await api.CreateClient().GetAsync("/api/antiforgery", TestContext.Current.CancellationToken);

        var keys = await api.QueryScalarAsync<long>("select count(*) from data_protection.keys");

        Assert.True(keys > 0);
    }

    [Fact]
    public void Another_instance_on_the_same_database_reads_what_this_one_protected()
    {
        // Two containers (replicas, or before and after a restart) share keys only through the database.
        var protectedByApi = api.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector(Purpose).Protect("hello");

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddPersistence(api.ConnectionString);
        services.AddPlatformDataProtection();
        using var otherInstance = services.BuildServiceProvider();

        var unprotected = otherInstance.GetRequiredService<IDataProtectionProvider>().CreateProtector(Purpose).Unprotect(protectedByApi);

        Assert.Equal("hello", unprotected);
    }
}
