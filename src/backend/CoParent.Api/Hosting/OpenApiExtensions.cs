namespace CoParent.Api.Hosting;

internal static class OpenApiExtensions
{
    private const string DocumentName = "v1";

    public static IServiceCollection AddPlatformOpenApi(this IServiceCollection services)
    {
        return services.AddOpenApi(DocumentName, o => o.AddDocumentTransformer((document, _, _) =>
        {
            document.Info.Title = "Parenthesis API";
            document.Info.Version = DocumentName;
            return Task.CompletedTask;
        }));
    }

    /// <summary>Serves /openapi/v1.json and Swagger UI at /swagger. Development only.</summary>
    public static WebApplication MapPlatformOpenApi(this WebApplication app)
    {
        app.MapOpenApi();
        app.UseSwaggerUI(o =>
        {
            o.SwaggerEndpoint($"/openapi/{DocumentName}.json", $"Parenthesis API {DocumentName}");
            o.DocumentTitle = "Parenthesis API";
        });
        return app;
    }
}
