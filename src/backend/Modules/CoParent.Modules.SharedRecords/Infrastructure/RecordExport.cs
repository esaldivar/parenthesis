using System.Data;
using CoParent.Modules.Families.Contracts;
using CoParent.Modules.SharedRecords.Domain;
using CoParent.Modules.SharedRecords.Infrastructure.Persistence;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using NodaTime;

namespace CoParent.Modules.SharedRecords.Infrastructure;

internal sealed record RecordExportRow(
    RecordKind Kind, Guid RecordId, Guid? EntryId, string Title, string Currency, long? AmountMinor,
    DateTimeOffset SubmittedAt, DateOnly? PaidOn, PaidTo? PaidTo, EntryStatus? Status, DateTimeOffset? RespondedAt);

/// <summary>Exports the same family and participant scope as Shared Records. Queries never load attachment details.</summary>
internal static class RecordExport
{
    public const string RateLimitPolicy = "shared-records-export";
    private const int MaxRows = 1_000;

    public static async Task<IResult> DownloadAsync(
        DateOnly? from, DateOnly? to, string? language, HttpContext http,
        SharedRecordsDbContext db, ITenantContext tenant, IFamilyRoster roster, TimeProvider clock, CancellationToken ct)
    {
        if (from is null || to is null || from > to || from.Value.Year < 1900 || to.Value.Year > 9998)
        {
            return TypedResults.BadRequest();
        }

        var zone = DateTimeZoneProviders.Tzdb.GetZoneOrNull(await roster.TimeZoneAsync(ct)) ?? DateTimeZone.Utc;
        var start = StartOfDay(zone, LocalDate.FromDateOnly(from.Value));
        var end = StartOfDay(zone, LocalDate.FromDateOnly(to.Value).PlusDays(1));
        var me = tenant.MembershipId;
        var funds = db.Funds.AsNoTracking().Where(f => f.ProposerId == me || f.CoParentId == me);
        var support = db.SupportRecords.AsNoTracking().Where(r => r.PayerId == me || r.RecipientId == me);
        var entries = db.Entries.AsNoTracking().Where(e => e.SubmittedAt >= start && e.SubmittedAt < end);

        // Each source is bounded, and the read transaction keeps response states and requests in one snapshot.
        var fundRequests = funds.Where(f => f.CreatedAt >= start && f.CreatedAt < end)
            .Select(f => new RecordExportRow(RecordKind.Fund, f.Id, null, f.Title, f.Currency,
                f.ProposerShareMinor + f.CoParentShareMinor, f.CreatedAt, null, null, null, null));
        var supportRequests = support.Where(r => r.CreatedAt >= start && r.CreatedAt < end)
            .Select(r => new RecordExportRow(RecordKind.Support, r.Id, null, r.Title, r.Currency,
                r.ReferenceMinor, r.CreatedAt, null, null, null, null));
        var contributions =
            from e in entries
            where e.RecordKind == RecordKind.Fund
            join f in funds on e.RecordId equals f.Id
            select new RecordExportRow(RecordKind.Fund, f.Id, e.Id, f.Title, f.Currency,
                e.AmountMinor, e.SubmittedAt, e.PaidOn, e.PaidTo, e.Status, e.RespondedAt);
        var payments =
            from e in entries
            where e.RecordKind == RecordKind.Support
            join r in support on e.RecordId equals r.Id
            select new RecordExportRow(RecordKind.Support, r.Id, e.Id, r.Title, r.Currency,
                e.AmountMinor, e.SubmittedAt, e.PaidOn, e.PaidTo, e.Status, e.RespondedAt);

        List<RecordExportRow> rows;
        await using (var snapshot = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct))
        {
            rows = await fundRequests.Take(MaxRows + 1).ToListAsync(ct);
            rows.AddRange(await supportRequests.Take(MaxRows + 1).ToListAsync(ct));
            rows.AddRange(await contributions.Take(MaxRows + 1).ToListAsync(ct));
            rows.AddRange(await payments.Take(MaxRows + 1).ToListAsync(ct));
            await snapshot.CommitAsync(ct);
        }

        if (rows.Count == 0)
        {
            return TypedResults.UnprocessableEntity();
        }

        if (rows.Count > MaxRows)
        {
            return TypedResults.StatusCode(StatusCodes.Status413PayloadTooLarge);
        }

        http.Response.Headers.XContentTypeOptions = "nosniff";
        var ordered = rows.OrderBy(r => r.SubmittedAt).ThenBy(r => r.Kind).ThenBy(r => r.RecordId).ThenBy(r => r.EntryId).ToList();
        var pdf = RecordExportPdf.Render(ordered, from.Value, to.Value, zone, clock.GetUtcNow(), language == "es-419");
        var name = FormattableString.Invariant($"Shared_Records_{from:yyyy-MM-dd}_to_{to:yyyy-MM-dd}.pdf");
        return TypedResults.File(pdf, "application/pdf", name);
    }

    private static DateTimeOffset StartOfDay(DateTimeZone zone, LocalDate date)
    {
        try
        {
            return zone.AtStartOfDay(date).ToInstant().ToDateTimeOffset();
        }
        catch (SkippedTimeException)
        {
            return zone.AtStartOfDay(date.PlusDays(1)).ToInstant().ToDateTimeOffset();
        }
    }
}
