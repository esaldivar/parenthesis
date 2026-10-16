using CoParent.Api.Hosting;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Families;
using CoParent.Modules.Identity;

var builder = WebApplication.CreateBuilder(args);

var postgresConnectionString = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException(
        "Connection string 'Postgres' is not configured. For local development, set it with dotnet user-secrets (see README).");

builder.AddPlatformLogging();
builder.Services
    .AddPersistence(postgresConnectionString)
    .AddPlatformProblemDetails()
    .AddPlatformOpenApi()
    .AddPlatformHealthChecks()
    .AddPlatformAntiforgery();

builder.Services
    .AddIdentityModule()
    .AddFamiliesModule();

var app = builder.Build();

// `dotnet run --project src/backend/CoParent.Api -- migrate` applies every module's migrations, then exits.
if (args is ["migrate"])
{
    await app.Services.GetRequiredService<MigrationRunner>().MigrateAsync();
    return;
}

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseTraceIdHeader();
app.UseHttpLogging();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    app.MapPlatformOpenApi();
}

app.MapPlatformHealthChecks();

// Every /api endpoint requires a signed-in user unless it opts out, and every unsafe request needs an antiforgery token.
var api = app.MapGroup("/api")
    .RequireAuthorization()
    .AddEndpointFilter<AntiforgeryValidationFilter>();

api.MapAntiforgeryTokenEndpoint();
api.MapIdentityEndpoints();

await app.RunAsync();

// Exposed for WebApplicationFactory in integration tests.
public partial class Program;
