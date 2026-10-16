using CoParent.Modules.Families;
using CoParent.Modules.Identity;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddIdentityModule()
    .AddFamiliesModule();

var app = builder.Build();

app.Run();

// Exposed for WebApplicationFactory in integration tests.
public partial class Program;
