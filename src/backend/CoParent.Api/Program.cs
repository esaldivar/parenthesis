using CoParent.Api.Hosting;
using CoParent.Modules.Families;
using CoParent.Modules.Identity;

var builder = WebApplication.CreateBuilder(args);

var postgresConnectionString = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException(
        "Connection string 'Postgres' is not configured. For local development, set it with dotnet user-secrets (see README).");

builder.AddPlatformLogging();
builder.Services
    .AddPlatformProblemDetails()
    .AddPlatformOpenApi()
    .AddPlatformHealthChecks(postgresConnectionString);

builder.Services
    .AddIdentityModule()
    .AddFamiliesModule();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseTraceIdHeader();
app.UseHttpLogging();

if (app.Environment.IsDevelopment())
{
    app.MapPlatformOpenApi();
}

app.MapPlatformHealthChecks();

app.Run();

// Exposed for WebApplicationFactory in integration tests.
public partial class Program;
