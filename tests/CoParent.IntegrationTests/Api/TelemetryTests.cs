using System.Diagnostics;
using CoParent.Api.Hosting;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Trace;

namespace CoParent.IntegrationTests.Api;

/// <summary>Application Insights wiring (#86): off by default, and query strings never reach telemetry.</summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class TelemetryTests(ApiFactory api)
{
    // A well-formed connection string that points nowhere: nothing leaves the test machine.
    private const string FakeConnectionString =
        "InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=http://127.0.0.1:1/";

    [Fact]
    public void Telemetry_is_off_without_a_connection_string()
    {
        Assert.Null(api.Services.GetService<TracerProvider>());
    }

    [Fact]
    public async Task Telemetry_is_on_with_a_connection_string_and_drops_query_strings()
    {
        // The server stops the request's activity just after the response is sent, so wait for it.
        var stopped = new TaskCompletionSource<Activity>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var listener = new ActivityListener
        {
            ShouldListenTo = source => source.Name == "Microsoft.AspNetCore",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = activity =>
            {
                if (activity.GetTagItem("url.path") as string == "/health/live")
                {
                    stopped.TrySetResult(activity);
                }
            },
        };
        ActivitySource.AddActivityListener(listener);

        await using var withTelemetry = api.WithWebHostBuilder(builder =>
            builder.UseSetting(TelemetryExtensions.ConnectionStringKey, FakeConnectionString));
        Assert.NotNull(withTelemetry.Services.GetService<TracerProvider>());

        var response = await withTelemetry.CreateClient()
            .GetAsync("/health/live?token=synthetic-secret", TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();

        var request = await stopped.Task.WaitAsync(TimeSpan.FromSeconds(10), TestContext.Current.CancellationToken);
        Assert.Null(request.GetTagItem("url.query"));
        Assert.DoesNotContain(request.TagObjects, tag => tag.Value is string s && s.Contains("synthetic-secret", StringComparison.Ordinal));
    }

    [Fact]
    public void Redaction_strips_the_query_from_full_urls()
    {
        using var activity = new Activity("dependency");
        activity.SetTag("url.full", "https://example.test/path?sig=synthetic");
        activity.SetTag("url.query", "?sig=synthetic");

        TelemetryRedaction.RemoveQuery(activity);

        Assert.Equal("https://example.test/path", activity.GetTagItem("url.full"));
        Assert.Null(activity.GetTagItem("url.query"));
    }
}
