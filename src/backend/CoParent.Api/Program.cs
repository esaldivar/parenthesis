using System.Security.Claims;
using System.Threading.RateLimiting;
using System.Text.Json.Serialization;
using CoParent.Api.Hosting;
using CoParent.Infrastructure.DataProtection;
using CoParent.Infrastructure.Email;
using CoParent.Infrastructure.Persistence;
using CoParent.Modules.Approvals;
using CoParent.Modules.Calendar;
using CoParent.Modules.Families;
using CoParent.Modules.Identity;
using CoParent.Modules.Memories;
using CoParent.Modules.Messaging;
using CoParent.Modules.SharedRecords;

var builder = WebApplication.CreateBuilder(args);

var postgresConnectionString = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException(
        "Connection string 'Postgres' is not configured. For local development, set it with dotnet user-secrets (see README).");

builder.AddPlatformLogging();
builder.AddPlatformTelemetry();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services
    .AddPersistence(postgresConnectionString)
    .AddPlatformDataProtection()
    .AddEmail()
    .AddPlatformProblemDetails()
    .AddPlatformOpenApi()
    .AddPlatformHealthChecks()
    .AddPlatformAntiforgery()
    .AddPlatformPerformance();

builder.Services
    .AddIdentityModule()
    .AddApprovalsModule()
    .AddFamiliesModule()
    .AddCalendarModule()
    .AddMemoriesModule()
    .AddMessagingModule()
    .AddSharedRecordsModule();

builder.Services.AddRateLimiter(options =>
    options.AddPolicy(FeedbackEndpoints.RateLimitPolicy, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(10),
            })));

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
app.UseServerTiming();
app.UseHttpLogging();
app.UseResponseCompression();
app.UseSpaStaticFiles();
app.UseMessagingHubOriginCheck();
app.UseAuthentication();
app.UseAuthorization();
app.UseTenantGate();
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
var family = api.MapFamilyScopedGroup();

api.MapIdentityEndpoints();
api.MapFeedbackEndpoints();
api.MapFamiliesEndpoints(family);
family.MapApprovalsEndpoints();
family.MapCalendarEndpoints();
family.MapMemoriesEndpoints();
family.MapMessagingEndpoints();
family.MapSharedRecordsEndpoints();

// Live chat updates (#125). Signed-in parents only; the hub checks family membership itself.
app.MapMessagingHub();

// Everything else that looks like a client-side route gets the Angular app.
app.MapSpaFallback();

await app.RunAsync();
