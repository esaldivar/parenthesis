using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// New calendar dates start from today in the family's time zone (#232, owner decisions October 23, 2026). Earlier times
/// today are fine; an event, reminder or task already in the past keeps its own day when edited. "Today" is fixed at
/// October 1, 2026 in these tests (see <see cref="ApiFactory.FixedToday"/>); the family is in America/Chicago.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class DateRuleTests(ApiFactory api) : IAsyncLifetime
{
    // Thursday, October 1, 2026 in Chicago (CDT, UTC-5).
    private static readonly DateTimeOffset _today = new(2026, 10, 1, 0, 0, 0, TimeSpan.FromHours(-5));

    private static readonly string[] _tuesdays = ["Tuesday"];

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task A_new_event_starts_from_today_and_earlier_times_today_are_fine()
    {
        var (dad, familyId) = await SoloAsync();
        using var _ = dad;

        var yesterday = await dad.PostAsync(Events(familyId), Activity(_today.AddDays(-1).AddHours(17)));
        var earlyToday = await dad.PostAsync(Events(familyId), Activity(_today.AddMinutes(30)));
        var repeating = await dad.PostAsync(Events(familyId), new
        {
            category = "Unavailable",
            startsAt = _today.AddDays(-2).AddHours(9),
            endsAt = _today.AddDays(-2).AddHours(12),
            repeat = new { days = _tuesdays, count = 3 },
        });

        await AssertRefusedAsync(yesterday, "startsAt", "Choose a start date from today on.");
        Assert.Equal(HttpStatusCode.Created, earlyToday.StatusCode);
        await AssertRefusedAsync(repeating, "startsAt", "Choose a start date from today on.");
    }

    [Fact]
    public async Task A_past_event_keeps_its_own_day_when_edited_and_moves_only_to_today_or_later()
    {
        var (dad, familyId) = await SoloAsync();
        using var _ = dad;
        var id = (await JsonAsync(await dad.PostAsync(Events(familyId), Activity(_today.AddDays(5).AddHours(17)))))
            .GetProperty("id").GetGuid();
        // Made before this rule, or simply now past: Sunday, September 20.
        var past = _today.AddDays(-11).AddHours(17);
        await api.QueryScalarAsync<int>(
            "UPDATE calendar.events SET starts_at = @starts, ends_at = @ends WHERE id = @id RETURNING 1",
            ("starts", past.UtcDateTime), ("ends", past.AddHours(1).UtcDateTime), ("id", id));

        var renamed = await dad.SendAsync(HttpMethod.Patch, $"{Events(familyId)}/{id}", new { title = "Soccer game" });
        var sameDayLater = await dad.SendAsync(HttpMethod.Patch, $"{Events(familyId)}/{id}", new { startsAt = past.AddHours(1), endsAt = past.AddHours(2) });
        var earlierDay = await dad.SendAsync(HttpMethod.Patch, $"{Events(familyId)}/{id}", new { startsAt = past.AddDays(3), endsAt = past.AddDays(3).AddHours(1) });
        var fromToday = await dad.SendAsync(HttpMethod.Patch, $"{Events(familyId)}/{id}", new { startsAt = _today.AddHours(17), endsAt = _today.AddHours(18) });

        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        Assert.Equal(HttpStatusCode.OK, sameDayLater.StatusCode);
        await AssertRefusedAsync(earlierDay, "startsAt", "Choose a start date from today on.");
        Assert.Equal(HttpStatusCode.OK, fromToday.StatusCode);
    }

    [Fact]
    public async Task Reminders_and_tasks_are_for_today_on_and_an_overdue_one_keeps_its_day()
    {
        var (dad, familyId) = await SoloAsync();
        using var _ = dad;
        var reminders = $"/api/families/{familyId}/calendar/reminders";
        var tasks = $"/api/families/{familyId}/calendar/tasks";

        var pastReminder = await dad.PostAsync(reminders, new { title = "Spirit Day", startsAt = _today.AddDays(-1).AddHours(8), allDay = false });
        var reminderToday = await dad.PostAsync(reminders, new { title = "Spirit Day", startsAt = _today.AddHours(8), allDay = false });
        var pastTask = await dad.PostAsync(tasks, new { title = "Field trip form", dueDate = "2026-09-30" });
        var created = await dad.PostAsync(tasks, new { title = "Field trip form", dueDate = "2026-10-01" });

        await AssertRefusedAsync(pastReminder, "startsAt", "Choose a date from today on.");
        Assert.Equal(HttpStatusCode.Created, reminderToday.StatusCode);
        await AssertRefusedAsync(pastTask, "dueDate", "Choose a date from today on.");
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        // Overdue since September 25: a title change keeps its due date; moving it is to today or later.
        var id = (await JsonAsync(created)).GetProperty("id").GetGuid();
        await api.QueryScalarAsync<int>(
            "UPDATE calendar.tasks SET due_date = @due WHERE id = @id RETURNING 1", ("due", new DateOnly(2026, 9, 25)), ("id", id));
        var renamed = await dad.SendAsync(HttpMethod.Put, $"{tasks}/{id}", new { title = "Sign the form", dueDate = "2026-09-25", version = await VersionAsync(dad, tasks, id) });
        var earlier = await dad.SendAsync(HttpMethod.Put, $"{tasks}/{id}", new { title = "Sign the form", dueDate = "2026-09-28", version = await VersionAsync(dad, tasks, id) });

        Assert.Equal(HttpStatusCode.OK, renamed.StatusCode);
        await AssertRefusedAsync(earlier, "dueDate", "Choose a date from today on.");
    }

    private static object Activity(DateTimeOffset start) =>
        new { category = "Activity", title = "Soccer practice", startsAt = start, endsAt = start.AddHours(1) };

    private static string Events(Guid familyId) => $"/api/families/{familyId}/calendar/events";

    private static async Task AssertRefusedAsync(HttpResponseMessage response, string field, string message)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await JsonAsync(response)).GetProperty("errors");
        Assert.Equal(message, errors.GetProperty(field)[0].GetString());
    }

    private static async Task<uint> VersionAsync(ApiSession session, string tasks, Guid id) =>
        (await JsonAsync(await session.GetAsync($"{tasks}/{id}"))).GetProperty("version").GetUInt32();

    private async Task<(ApiSession Dad, Guid FamilyId)> SoloAsync()
    {
        var dad = await ApiSession.SignedInAsync(api, displayName: "Dad");
        return (dad, await dad.CreateFamilyAsync("Rivera Family"));
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
}
