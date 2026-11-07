using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using CoParent.Modules.SharedRecords.Contracts;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;

namespace CoParent.IntegrationTests.Api;

/// <summary>
/// Contributions to Shared Funds and payments on Child Support records (#477), following the issue's review steps.
/// Synthetic family; attachments are generated in the test and stored in Azurite.
/// </summary>
[Collection(ApiCollectionDefinition.Name)]
public sealed class SharedRecordReportTests(ApiFactory api) : IAsyncLifetime
{
    private static readonly byte[] _pdf = Encoding.ASCII.GetBytes("%PDF-1.4\n% synthetic payment confirmation\n%%EOF\n");
    private static readonly byte[] _png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    public async ValueTask InitializeAsync() => await api.ResetDatabaseAsync();
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    [Fact]
    public async Task Only_acknowledged_contributions_count_and_only_the_other_parent_answers_them()
    {
        var (dad, mom, root) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        var fund = await JsonAsync(await dad.PostAsync($"{root}/shared-funds",
            new { title = "Fall soccer fees", currency = "USD", proposerShareMinor = 18000, coParentShareMinor = 12000 }));
        var fundId = fund.GetProperty("id").GetGuid();

        // Nothing can be reported until both parents agree.
        Assert.Equal(HttpStatusCode.Conflict, (await ReportAsync(dad, $"{root}/shared-funds/{fundId}/contributions", 16000, "Vendor", _pdf)).StatusCode);
        Assert.Equal(1, await AttentionAsync(mom, root));
        Assert.Equal(0, await AttentionAsync(dad, root));
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync($"{root}/approvals/{fund.GetProperty("approvalId").GetGuid()}/approve")).StatusCode);

        // A report needs a real PDF, PNG or JPEG of 10 MB or less; nothing is recorded otherwise.
        var contributions = $"{root}/shared-funds/{fundId}/contributions";
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await ReportAsync(dad, contributions, 16000, "Vendor", [])).StatusCode);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, (await ReportAsync(dad, contributions, 16000, "Vendor", "not a pdf"u8.ToArray())).StatusCode);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge,
            (await ReportAsync(dad, contributions, 16000, "Vendor", [.. _pdf, .. new byte[10 * 1024 * 1024]])).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ReportAsync(dad, contributions, 0, "Vendor", _pdf)).StatusCode);

        // The same submission sent twice is recorded once.
        var requestId = Guid.NewGuid();
        var dads = await JsonAsync(await ReportAsync(dad, contributions, 16000, "Vendor", _pdf, requestId));
        var again = await JsonAsync(await ReportAsync(dad, contributions, 16000, "Vendor", _pdf, requestId));
        Assert.Equal(dads.GetProperty("id").GetGuid(), again.GetProperty("id").GetGuid());
        var moms = await JsonAsync(await ReportAsync(mom, contributions, 4000, "CoParent", _png));
        Assert.Equal("Pending", moms.GetProperty("status").GetString());
        Assert.False(moms.GetProperty("canRespond").GetBoolean());

        var totals = (await FundAsync(dad, root)).GetProperty("totals");
        Assert.Equal(0, totals.GetProperty("acknowledgedMinor").GetInt64());
        Assert.Equal(20000, totals.GetProperty("pendingMinor").GetInt64());
        Assert.Equal(2, (await FundAsync(dad, root)).GetProperty("entries").GetArrayLength());

        // Only the other parent answers a report, once.
        var dadsEntry = $"{root}/shared-records/entries/{dads.GetProperty("id").GetGuid()}";
        var momsEntry = $"{root}/shared-records/entries/{moms.GetProperty("id").GetGuid()}";
        Assert.Equal(HttpStatusCode.Forbidden, (await dad.PostAsync($"{dadsEntry}/acknowledge")).StatusCode);
        Assert.Equal(1, await AttentionAsync(mom, root));
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync($"{dadsEntry}/acknowledge")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await mom.PostAsync($"{dadsEntry}/dispute")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await dad.PostAsync($"{momsEntry}/dispute")).StatusCode);
        Assert.Equal(0, await AttentionAsync(mom, root));

        // A dispute never counts toward what was acknowledged.
        totals = (await FundAsync(mom, root)).GetProperty("totals");
        Assert.Equal(16000, totals.GetProperty("acknowledgedMinor").GetInt64());
        Assert.Equal(0, totals.GetProperty("pendingMinor").GetInt64());
        Assert.Equal(4000, totals.GetProperty("disputedMinor").GetInt64());

        // Both parents can open the attachment; nobody else can.
        var file = await mom.GetAsync($"{dadsEntry}/attachment");
        Assert.Equal(HttpStatusCode.OK, file.StatusCode);
        Assert.Equal("application/pdf", file.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", file.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal(_pdf, await file.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken));
        Assert.Equal(HttpStatusCode.OK, (await dad.GetAsync($"{momsEntry}/attachment")).StatusCode);
        using var outsider = await ApiSession.SignedInAsync(api);
        var otherFamily = await outsider.CreateFamilyAsync();
        Assert.Equal(HttpStatusCode.NotFound,
            (await outsider.GetAsync($"/api/families/{otherFamily}/shared-records/entries/{dads.GetProperty("id").GetGuid()}/attachment")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await outsider.GetAsync($"{dadsEntry}/attachment")).StatusCode);
    }

    [Fact]
    public async Task A_child_support_record_takes_lump_sum_or_partial_payments_from_the_paying_parent_only()
    {
        var (dad, mom, root) = await FamilyAsync();
        using var _ = dad;
        using var __ = mom;
        Assert.Equal(HttpStatusCode.BadRequest,
            (await mom.PostAsync($"{root}/child-support", new { title = "November 2026", currency = "USD", youPay = false, referenceMinor = 0 })).StatusCode);
        var record = await JsonAsync(await mom.PostAsync($"{root}/child-support",
            new { title = "November 2026", currency = "USD", youPay = false, referenceMinor = 50000 }));
        Assert.False(record.GetProperty("youPay").GetBoolean());
        var payments = $"{root}/child-support/{record.GetProperty("id").GetGuid()}/payments";

        // Only the paying parent reports, and only the other parent confirms receipt.
        Assert.Equal(HttpStatusCode.Forbidden, (await ReportAsync(mom, payments, 25000, null, _pdf)).StatusCode);
        var lump = await JsonAsync(await ReportAsync(dad, payments, 25000, null, _pdf));
        Assert.Equal("CoParent", lump.GetProperty("paidTo").GetString());
        Assert.Equal(1, await AttentionAsync(mom, root));
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync($"{root}/shared-records/entries/{lump.GetProperty("id").GetGuid()}/acknowledge")).StatusCode);
        var first = await JsonAsync(await ReportAsync(dad, payments, 10000, null, _png));
        await ReportAsync(dad, payments, 15000, null, _pdf);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync($"{root}/shared-records/entries/{first.GetProperty("id").GetGuid()}/acknowledge")).StatusCode);

        var seen = Assert.Single((await JsonAsync(await dad.GetAsync($"{root}/child-support"))).EnumerateArray());
        Assert.True(seen.GetProperty("youPay").GetBoolean());
        Assert.Equal(50000, seen.GetProperty("referenceMinor").GetInt64());
        Assert.Equal(35000, seen.GetProperty("totals").GetProperty("acknowledgedMinor").GetInt64());
        Assert.Equal(15000, seen.GetProperty("totals").GetProperty("pendingMinor").GetInt64());
        Assert.Equal(3, seen.GetProperty("entries").GetArrayLength());

        // When the family closes, every record, report and attachment goes. Closing only marks the reports removed, in
        // its own transaction; the cleanup then deletes each file and its row.
        Assert.Equal(HttpStatusCode.NoContent, (await dad.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);
        Assert.Equal(3L, await CountAsync("entries", root));
        var cleanup = api.Services.GetRequiredService<ISharedRecordsCleanup>();
        Assert.Equal(0, await cleanup.CleanUpAsync(TestContext.Current.CancellationToken));
        Assert.Equal(HttpStatusCode.NoContent, (await mom.PostAsync("/api/me/delete", new { password = ApiSession.Password })).StatusCode);
        Assert.Equal(0L, await CountAsync("support_records", root));
        Assert.Equal(3L, await api.QueryScalarAsync<long>(
            "select count(*) from shared_records.entries where family_id = @v and removed_at is not null",
            ("v", Guid.Parse(root["/api/families/".Length..]))));
        Assert.Equal(3, await cleanup.CleanUpAsync(TestContext.Current.CancellationToken));
        Assert.Equal(0L, await CountAsync("entries", root));
        Assert.Equal(0, await cleanup.CleanUpAsync(TestContext.Current.CancellationToken));
    }

    private async Task<(ApiSession Dad, ApiSession Mom, string Root)> FamilyAsync()
    {
        var dad = await ApiSession.SignedInAsync(api);
        var familyId = await dad.CreateFamilyAsync();
        var root = $"/api/families/{familyId}";
        var email = ApiSession.NewEmail();
        Assert.Equal(HttpStatusCode.Accepted, (await dad.PostAsync($"{root}/invitations", new { email })).StatusCode);
        var token = QueryHelpers.ParseQuery(dad.Emails.LatestLink(email, "invited").Query)["token"].ToString();
        var mom = await ApiSession.SignedInAsync(api, email: email);
        Assert.Equal(HttpStatusCode.OK, (await mom.PostAsync("/api/invitations/accept", new { token })).StatusCode);
        return (dad, mom, root);
    }

    private static Task<HttpResponseMessage> ReportAsync(
        ApiSession parent, string path, long amountMinor, string? paidTo, byte[] file, Guid? requestId = null)
    {
        var query = $"?amountMinor={amountMinor}&paidOn=2026-11-07&requestId={requestId ?? Guid.NewGuid()}"
            + (paidTo is null ? "" : $"&paidTo={paidTo}");
        return parent.SendBytesAsync(HttpMethod.Post, path + query, file, "application/octet-stream");
    }

    private static async Task<int> AttentionAsync(ApiSession parent, string root) =>
        (await JsonAsync(await parent.GetAsync($"{root}/shared-records/attention"))).GetProperty("count").GetInt32();

    private static async Task<JsonElement> FundAsync(ApiSession parent, string root) =>
        Assert.Single((await JsonAsync(await parent.GetAsync($"{root}/shared-funds"))).EnumerateArray());

    private Task<long> CountAsync(string table, string root) =>
        api.QueryScalarAsync<long>($"select count(*) from shared_records.{table} where family_id = @v",
            ("v", Guid.Parse(root["/api/families/".Length..])));

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)}");
        return await response.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
    }
}
