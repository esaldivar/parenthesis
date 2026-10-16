using CoParent.Infrastructure.Persistence;
using CoParent.IntegrationTests.Infrastructure;
using CoParent.SharedKernel.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.IntegrationTests.Persistence;

public sealed class UnitOfWorkTests(PostgresFixture postgres) : IAsyncLifetime
{
    private ServiceProvider _services = null!;

    // Each test writes notes tagged with its own marker, so tests never see each other's rows.
    private readonly string _marker = Guid.NewGuid().ToString("N");

    public async ValueTask InitializeAsync()
    {
        _services = new ServiceCollection()
            .AddLogging()
            .AddPersistence(postgres.ConnectionString)
            .AddModuleDbContext<AlphaDbContext>()
            .AddModuleDbContext<BetaDbContext>()
            .BuildServiceProvider(validateScopes: true);

        await CreateSchemaAsync<AlphaDbContext>();
        await CreateSchemaAsync<BetaDbContext>();
    }

    public ValueTask DisposeAsync() => _services.DisposeAsync();

    [Fact]
    public async Task Changes_from_two_module_contexts_commit_together()
    {
        await using (var scope = _services.CreateAsyncScope())
        {
            var (uow, alpha, beta) = Resolve(scope);

            await uow.ExecuteAsync(async ct =>
            {
                alpha.Notes.Add(new Note { Text = _marker });
                await alpha.SaveChangesAsync(ct);
                beta.Notes.Add(new Note { Text = _marker });
                await beta.SaveChangesAsync(ct);
            }, TestContext.Current.CancellationToken);
        }

        Assert.Equal((1, 1), await CountNotesAsync());
    }

    [Fact]
    public async Task Failure_after_saves_rolls_back_both_module_contexts()
    {
        await using (var scope = _services.CreateAsyncScope())
        {
            var (uow, alpha, beta) = Resolve(scope);

            await Assert.ThrowsAsync<InvalidOperationException>(() => uow.ExecuteAsync(async ct =>
            {
                alpha.Notes.Add(new Note { Text = _marker });
                await alpha.SaveChangesAsync(ct);
                beta.Notes.Add(new Note { Text = _marker });
                await beta.SaveChangesAsync(ct);
                throw new InvalidOperationException("Simulated failure after both saves");
            }, TestContext.Current.CancellationToken));
        }

        Assert.Equal((0, 0), await CountNotesAsync());
    }

    [Fact]
    public async Task Nested_unit_of_work_joins_the_outer_transaction()
    {
        await using (var scope = _services.CreateAsyncScope())
        {
            var (uow, alpha, _) = Resolve(scope);

            await Assert.ThrowsAsync<InvalidOperationException>(() => uow.ExecuteAsync(async ct =>
            {
                await uow.ExecuteAsync(async innerCt =>
                {
                    alpha.Notes.Add(new Note { Text = _marker });
                    await alpha.SaveChangesAsync(innerCt);
                }, ct);

                throw new InvalidOperationException("Outer work fails after the inner unit of work completed");
            }, TestContext.Current.CancellationToken));
        }

        Assert.Equal((0, 0), await CountNotesAsync());
    }

    [Fact]
    public async Task Context_saves_normally_after_a_unit_of_work_has_completed()
    {
        await using (var scope = _services.CreateAsyncScope())
        {
            var (uow, alpha, _) = Resolve(scope);
            var ct = TestContext.Current.CancellationToken;

            await uow.ExecuteAsync(async innerCt =>
            {
                alpha.Notes.Add(new Note { Text = _marker });
                await alpha.SaveChangesAsync(innerCt);
            }, ct);

            alpha.Notes.Add(new Note { Text = _marker });
            await alpha.SaveChangesAsync(ct);
        }

        Assert.Equal((2, 0), await CountNotesAsync());
    }

    [Fact]
    public async Task Module_contexts_in_one_scope_share_a_single_connection()
    {
        await using var scope = _services.CreateAsyncScope();
        var (_, alpha, beta) = Resolve(scope);

        Assert.Same(alpha.Database.GetDbConnection(), beta.Database.GetDbConnection());
    }

    private static (IUnitOfWork Uow, AlphaDbContext Alpha, BetaDbContext Beta) Resolve(AsyncServiceScope scope) => (
        scope.ServiceProvider.GetRequiredService<IUnitOfWork>(),
        scope.ServiceProvider.GetRequiredService<AlphaDbContext>(),
        scope.ServiceProvider.GetRequiredService<BetaDbContext>());

    private async Task<(int Alpha, int Beta)> CountNotesAsync()
    {
        await using var scope = _services.CreateAsyncScope();
        var (_, alpha, beta) = Resolve(scope);
        var ct = TestContext.Current.CancellationToken;

        return (
            await alpha.Notes.CountAsync(n => n.Text == _marker, ct),
            await beta.Notes.CountAsync(n => n.Text == _marker, ct));
    }

    private async Task CreateSchemaAsync<TContext>() where TContext : DbContext
    {
        await using var scope = _services.CreateAsyncScope();
        var creator = scope.ServiceProvider.GetRequiredService<TContext>().GetService<IRelationalDatabaseCreator>();
        try
        {
            await creator.CreateTablesAsync();
        }
        catch (Npgsql.PostgresException e) when (e.SqlState == Npgsql.PostgresErrorCodes.DuplicateTable)
        {
            // Created by an earlier test in this run; the container is shared.
        }
    }
}
