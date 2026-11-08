using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CoParent.Modules.SharedRecords;

/// <summary>One report as either parent sees it. No file name is kept or shown: only that a PDF or image is attached.</summary>
internal sealed record EntryView(
    Guid Id,
    bool Yours,
    long AmountMinor,
    DateOnly PaidOn,
    PaidTo PaidTo,
    DateTimeOffset SubmittedAt,
    EntryStatus Status,
    DateTimeOffset? RespondedAt,
    string AttachmentType,
    bool CanRespond);

/// <summary>Totals for a record's progress. Disputed reports never count toward what was acknowledged.</summary>
internal sealed record Totals(long AcknowledgedMinor, long PendingMinor, long DisputedMinor);

internal sealed record SupportRecordView(
    Guid Id,
    string Title,
    string Currency,
    bool YouPay,
    long? ReferenceMinor,
    DateTimeOffset CreatedAt,
    bool CreatedByYou,
    IReadOnlyList<EntryView> Entries,
    Totals Totals);

/// <summary>
/// Reports on Shared Funds and Child Support records (#477): contributions, payments, attachments and the other parent's
/// response. Only the two parents on a record can see it; children never can (the routes answer 404 to them).
/// </summary>
internal static partial class RecordEndpoints
{
    public const string UploadRateLimitPolicy = "shared-records-upload";
    private static readonly string[] _currencies = ["USD", "CAD", "MXN"];

    public static void Map(RouteGroupBuilder funds, RouteGroupBuilder support, RouteGroupBuilder records)
    {
        funds.MapPost("/{fundId:guid}/contributions", ReportContributionAsync).RequireRateLimiting(UploadRateLimitPolicy);
        support.MapGet("/", ListSupportAsync);
        support.MapPost("/", CreateSupportAsync);
        support.MapPost("/{recordId:guid}/payments", ReportPaymentAsync).RequireRateLimiting(UploadRateLimitPolicy);
        records.MapPost("/entries/{entryId:guid}/acknowledge", (Guid entryId, [AsParameters] Services services, CancellationToken ct) =>
            RespondAsync(entryId, EntryStatus.Acknowledged, services, ct));
        records.MapPost("/entries/{entryId:guid}/dispute", (Guid entryId, [AsParameters] Services services, CancellationToken ct) =>
            RespondAsync(entryId, EntryStatus.Disputed, services, ct));
        records.MapGet("/entries/{entryId:guid}/attachment", AttachmentAsync);
        records.MapGet("/attention", AttentionAsync);
        // Whether reports can be sent at all, so the form can say so before a parent picks a file.
        records.MapGet("/attachment-storage", (IAttachmentStore store) => TypedResults.Ok(new AttachmentStorage(store.IsConfigured)));
    }

    internal sealed record Services(
        SharedRecordsDbContext Db, ITenantContext Tenant, IFamilyRoster Roster, IAttachmentStore Store, TimeProvider Clock,
        ILoggerFactory Loggers);

    internal sealed record AttachmentStorage(bool Ready);

    internal sealed record SupportProposal(string? Title, string? Currency, bool? YouPay, long? ReferenceMinor);

    internal sealed record Report(long? AmountMinor, DateOnly? PaidOn, PaidTo? PaidTo, Guid? RequestId);

    /// <summary>Each record's reports, newest first, as this parent sees them.</summary>
    public static async Task<ILookup<Guid, EntryView>> EntriesAsync(
        SharedRecordsDbContext db, Guid membershipId, IReadOnlyCollection<Guid> recordIds, CancellationToken ct)
    {
        var entries = await db.Entries.AsNoTracking()
            .Where(e => recordIds.Contains(e.RecordId))
            .OrderByDescending(e => e.SubmittedAt)
            .ThenBy(e => e.Id)
            .ToListAsync(ct);
        return entries.ToLookup(e => e.RecordId, e => View(e, membershipId));
    }

    public static EntryView View(Entry e, Guid me) => new(
        e.Id, e.ReporterId == me, e.AmountMinor, e.PaidOn, e.PaidTo, e.SubmittedAt, e.Status, e.RespondedAt,
        e.AttachmentType, e.Status == EntryStatus.Pending && e.ResponderId == me);

    public static Totals TotalsOf(IEnumerable<EntryView> entries)
    {
        long acknowledged = 0, pending = 0, disputed = 0;
        foreach (var entry in entries)
        {
            switch (entry.Status)
            {
                case EntryStatus.Acknowledged: acknowledged += entry.AmountMinor; break;
                case EntryStatus.Pending: pending += entry.AmountMinor; break;
                default: disputed += entry.AmountMinor; break;
            }
        }

        return new(acknowledged, pending, disputed);
    }

    private static async Task<IResult> ListSupportAsync([AsParameters] Services services, CancellationToken ct)
    {
        var me = services.Tenant.MembershipId;
        var records = await services.Db.SupportRecords.AsNoTracking()
            .Where(r => r.PayerId == me || r.RecipientId == me)
            .OrderByDescending(r => r.CreatedAt)
            .ThenBy(r => r.Id)
            .ToListAsync(ct);
        var entries = await EntriesAsync(services.Db, me, records.Select(r => r.Id).ToList(), ct);
        return TypedResults.Ok(records.Select(r =>
        {
            var list = entries[r.Id].ToList();
            return new SupportRecordView(r.Id, r.Title, r.Currency, r.PayerId == me, r.ReferenceMinor, r.CreatedAt,
                r.CreatedById == me, list, TotalsOf(list));
        }).ToList());
    }

    private static async Task<IResult> CreateSupportAsync(SupportProposal proposal, [AsParameters] Services services, CancellationToken ct)
    {
        var title = proposal.Title?.Trim();
        if (string.IsNullOrEmpty(title) || title.Length > SupportRecord.TitleLimit
            || proposal.Currency is null || !_currencies.Contains(proposal.Currency)
            || proposal.YouPay is null
            || proposal.ReferenceMinor is <= 0 or > Fund.ShareLimit)
        {
            return Problem(StatusCodes.Status400BadRequest, "invalid",
                "Enter a title, a supported currency, who pays, and any reference amount above zero.");
        }

        var me = services.Tenant.MembershipId;
        var parents = await services.Roster.ActiveParentMembershipIdsAsync(ct);
        if (parents.Count != 2 || !parents.Contains(me))
        {
            return Problem(StatusCodes.Status409Conflict, "no-co-parent", "Both parents need to be in the family to keep a Child Support record.");
        }

        var other = parents.Single(id => id != me);
        var record = new SupportRecord
        {
            FamilyId = services.Tenant.FamilyId,
            Title = title,
            Currency = proposal.Currency,
            PayerId = proposal.YouPay.Value ? me : other,
            RecipientId = proposal.YouPay.Value ? other : me,
            ReferenceMinor = proposal.ReferenceMinor,
            CreatedById = me,
            CreatedAt = services.Clock.GetUtcNow(),
        };
        services.Db.SupportRecords.Add(record);
        await services.Db.SaveChangesAsync(ct);
        return TypedResults.Ok(new SupportRecordView(record.Id, record.Title, record.Currency, proposal.YouPay.Value,
            record.ReferenceMinor, record.CreatedAt, true, [], new(0, 0, 0)));
    }

    private static async Task<IResult> ReportContributionAsync(
        Guid fundId, [AsParameters] Report report, HttpRequest request, [AsParameters] Services services, CancellationToken ct)
    {
        var content = await ReadAsync(request, ct);
        var me = services.Tenant.MembershipId;
        var fund = await services.Db.Funds.AsNoTracking()
            .SingleOrDefaultAsync(f => f.Id == fundId && (f.ProposerId == me || f.CoParentId == me), ct);
        if (fund is null)
        {
            return TypedResults.NotFound();
        }

        if (fund.Status != FundStatus.Open)
        {
            return Problem(StatusCodes.Status409Conflict, "not-open", "Contributions can be reported once both parents agree to the fund.");
        }

        var other = fund.ProposerId == me ? fund.CoParentId : fund.ProposerId;
        return await StoreReportAsync(RecordKind.Fund, fund.Id, other, report, report.PaidTo, content, services, ct);
    }

    private static async Task<IResult> ReportPaymentAsync(
        Guid recordId, [AsParameters] Report report, HttpRequest request, [AsParameters] Services services, CancellationToken ct)
    {
        var content = await ReadAsync(request, ct);
        var me = services.Tenant.MembershipId;
        var record = await services.Db.SupportRecords.AsNoTracking()
            .SingleOrDefaultAsync(r => r.Id == recordId && (r.PayerId == me || r.RecipientId == me), ct);
        if (record is null)
        {
            return TypedResults.NotFound();
        }

        if (record.PayerId != me)
        {
            return Problem(StatusCodes.Status403Forbidden, "not-payer", "Only the paying parent reports payments on this record.");
        }

        return await StoreReportAsync(RecordKind.Support, record.Id, record.RecipientId, report, PaidTo.CoParent, content, services, ct);
    }

    /// <summary>
    /// Saves a report with its attachment. The file is checked and stored first, then the report is recorded, so a
    /// failed upload records nothing. The same request id from the same parent records the report once.
    /// <paramref name="content"/> is the whole upload, already read, or null when it was over the limit.
    /// </summary>
    private static async Task<IResult> StoreReportAsync(
        RecordKind kind, Guid recordId, Guid responderId, Report report, PaidTo? paidTo, byte[]? content,
        Services services, CancellationToken ct)
    {
        var me = services.Tenant.MembershipId;
        var today = DateOnly.FromDateTime(services.Clock.GetUtcNow().UtcDateTime);
        if (report.AmountMinor is not (> 0 and <= Fund.ShareLimit) || report.PaidOn is not { } paidOn
            || paidOn > today.AddDays(1) || paidOn < new DateOnly(2000, 1, 1) || paidTo is null
            || !Enum.IsDefined(paidTo.Value) || report.RequestId is not { } requestId || requestId == Guid.Empty)
        {
            return Problem(StatusCodes.Status400BadRequest, "invalid", "Enter an amount above zero and the date the money moved.");
        }

        if (await services.Db.Entries.AsNoTracking().SingleOrDefaultAsync(
                e => e.RecordId == recordId && e.ReporterId == me && e.ClientRequestId == requestId, ct) is { } repeat)
        {
            return TypedResults.Ok(View(repeat, me));
        }

        if (!(await services.Roster.ActiveParentMembershipIdsAsync(ct)).Contains(responderId))
        {
            return Problem(StatusCodes.Status409Conflict, "no-co-parent", "Your co-parent has left the family, so this record can't take new reports.");
        }

        if (!services.Store.IsConfigured)
        {
            return Problem(StatusCodes.Status503ServiceUnavailable, "storage-off", "Attachments can't be saved yet. Try again later.");
        }

        if (content is null)
        {
            return Problem(StatusCodes.Status413PayloadTooLarge, "too-large", "Attach a file of 10 MB or less.");
        }

        if (AttachmentFiles.Detect(content) is not { } type)
        {
            return Problem(StatusCodes.Status415UnsupportedMediaType, "unsupported", "Attach a PDF, PNG or JPEG file.");
        }

        var id = Guid.NewGuid();
        var entry = new Entry
        {
            Id = id,
            FamilyId = services.Tenant.FamilyId,
            RecordKind = kind,
            RecordId = recordId,
            ReporterId = me,
            ResponderId = responderId,
            AmountMinor = report.AmountMinor.Value,
            PaidOn = paidOn,
            PaidTo = paidTo.Value,
            SubmittedAt = services.Clock.GetUtcNow(),
            ClientRequestId = requestId,
            AttachmentPath = $"{services.Tenant.FamilyId:N}/{id:N}",
            AttachmentType = type,
            AttachmentBytes = content.Length,
        };

        try
        {
            await services.Store.PutAsync(entry.AttachmentPath, content, type, ct);
        }
        catch (Exception failure) when (failure is not OperationCanceledException)
        {
            LogStorageFailed(services.Loggers.CreateLogger(typeof(RecordEndpoints)), failure);
            return Problem(StatusCodes.Status503ServiceUnavailable, "storage-failed", "The attachment couldn't be saved. Try again.");
        }

        services.Db.Entries.Add(entry);
        try
        {
            await services.Db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // The same submission arrived twice at once: keep the first and drop this file.
            await services.Store.DeleteAsync(entry.AttachmentPath, CancellationToken.None);
            services.Db.ChangeTracker.Clear();
            var first = await services.Db.Entries.AsNoTracking().SingleOrDefaultAsync(
                e => e.RecordId == recordId && e.ReporterId == me && e.ClientRequestId == requestId, ct);
            return first is null ? throw new InvalidOperationException("The report couldn't be saved.") : TypedResults.Ok(View(first, me));
        }

        return TypedResults.Ok(View(entry, me));
    }

    private static async Task<IResult> RespondAsync(Guid entryId, EntryStatus status, Services services, CancellationToken ct)
    {
        var me = services.Tenant.MembershipId;
        var now = services.Clock.GetUtcNow();
        var changed = await services.Db.Entries
            .Where(e => e.Id == entryId && e.ResponderId == me && e.Status == EntryStatus.Pending)
            .ExecuteUpdateAsync(set => set.SetProperty(e => e.Status, status).SetProperty(e => e.RespondedAt, now), ct);
        var entry = await services.Db.Entries.AsNoTracking()
            .SingleOrDefaultAsync(e => e.Id == entryId && (e.ReporterId == me || e.ResponderId == me), ct);
        if (entry is null)
        {
            return TypedResults.NotFound();
        }

        if (changed == 0)
        {
            return entry.ResponderId != me
                ? Problem(StatusCodes.Status403Forbidden, "not-responder", "Only the other parent can respond to this report.")
                : Problem(StatusCodes.Status409Conflict, "already-answered", "This report has already been answered.");
        }

        return TypedResults.Ok(View(entry, me));
    }

    private static async Task<IResult> AttachmentAsync(Guid entryId, HttpContext http, [AsParameters] Services services, CancellationToken ct)
    {
        var me = services.Tenant.MembershipId;
        var entry = await services.Db.Entries.AsNoTracking()
            .SingleOrDefaultAsync(e => e.Id == entryId && (e.ReporterId == me || e.ResponderId == me), ct);
        if (entry is null || !services.Store.IsConfigured
            || await services.Store.OpenAsync(entry.AttachmentPath, ct) is not { } content)
        {
            return TypedResults.NotFound();
        }

        http.Response.Headers.XContentTypeOptions = "nosniff";
        http.Response.Headers.ContentSecurityPolicy = "sandbox; default-src 'none'";
        return TypedResults.Stream(content, entry.AttachmentType,
            $"payment-attachment-{entry.PaidOn:yyyy-MM-dd}.{AttachmentFiles.Extensions[entry.AttachmentType]}");
    }

    /// <summary>How many records wait on this parent: proposals to agree to and reports to answer. Never amounts.</summary>
    private static async Task<IResult> AttentionAsync([AsParameters] Services services, CancellationToken ct)
    {
        var me = services.Tenant.MembershipId;
        var reports = await services.Db.Entries.CountAsync(e => e.ResponderId == me && e.Status == EntryStatus.Pending, ct);
        var proposals = await services.Db.Funds.CountAsync(f => f.CoParentId == me && f.Status == FundStatus.AwaitingAgreement, ct);
        return TypedResults.Ok(new { Count = reports + proposals });
    }

    /// <summary>
    /// Reads the whole upload before any answer is sent, or null when it's over 10 MB. Answering while a browser is
    /// still sending makes the hosting ingress drop the connection, so the parent would see "couldn't reach Parenthesis"
    /// instead of the real reason. An oversized upload is still read to the end (Kestrel's own body limit caps it) but
    /// not kept.
    /// </summary>
    internal static async Task<byte[]?> ReadAsync(HttpRequest request, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        var tooLarge = request.ContentLength > Entry.MaxAttachmentBytes;
        int read;
        while ((read = await request.Body.ReadAsync(chunk, ct)) > 0)
        {
            tooLarge |= buffer.Length + read > Entry.MaxAttachmentBytes;
            if (!tooLarge)
            {
                await buffer.WriteAsync(chunk.AsMemory(0, read), ct);
            }
        }

        return tooLarge ? null : buffer.ToArray();
    }

    private static ProblemHttpResult Problem(int status, string reason, string title) =>
        TypedResults.Problem(title: title, statusCode: status, extensions: new Dictionary<string, object?> { ["reason"] = reason });

    [LoggerMessage(Level = LogLevel.Warning, Message = "A shared record attachment couldn't be written to storage")]
    private static partial void LogStorageFailed(ILogger logger, Exception exception);
}
