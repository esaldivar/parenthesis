namespace CoParent.Api.Hosting;

internal static class ProblemDetailsExtensions
{
    /// <summary>RFC 9457 problem details for every error response, including unhandled exceptions and bare status codes.</summary>
    public static IServiceCollection AddPlatformProblemDetails(this IServiceCollection services)
    {
        return services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
            ctx.ProblemDetails.Extensions["traceId"] = LoggingExtensions.CurrentTraceId(ctx.HttpContext));
    }
}
