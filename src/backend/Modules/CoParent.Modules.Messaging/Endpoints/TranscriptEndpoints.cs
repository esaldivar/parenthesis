using System.Net.Mime;
using CoParent.Modules.Messaging.Domain;
using CoParent.Modules.Messaging.Infrastructure.Persistence;
using CoParent.Modules.Messaging.Transcripts;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Net.Http.Headers;

namespace CoParent.Modules.Messaging.Endpoints;

/// <summary>A saved transcript in the list: its file name, the messages' dates, and how many messages it holds.</summary>
internal sealed record SavedTranscriptView(
    Guid Id, string FileName, DateOnly? From, DateOnly? To, string RangeLabel, int MessageCount, DateTimeOffset CreatedAt);

internal sealed record SaveTranscriptRequest(DateOnly? From, DateOnly? To, string? Language);

/// <summary>
/// PDF transcripts of the parents' conversation (#125, slice 3 of docs/design/m4-chat.md). A parent previews a range (or
/// all messages), downloads a copy, or saves an immutable snapshot to Parenthesis; saved transcripts are theirs alone.
/// Parents only, behind the tenant gate; the PDFs are never cached.
/// </summary>
internal static class TranscriptEndpoints
{
    public const string SaveRateLimitPolicy = "chat-transcript-save";
    public const string RenderRateLimitPolicy = "chat-transcript-render";

    public static void Map(RouteGroupBuilder chat)
    {
        var transcripts = chat.MapGroup("/transcripts");
        transcripts.MapGet("/", ListAsync);
        transcripts.MapPost("/", SaveAsync).RequireRateLimiting(SaveRateLimitPolicy);
        transcripts.MapGet("/preview", PreviewAsync).RequireRateLimiting(RenderRateLimitPolicy);
        transcripts.MapGet("/pdf", PdfAsync).RequireRateLimiting(RenderRateLimitPolicy);
        transcripts.MapGet("/{transcriptId:guid}/pdf", SavedPdfAsync);
    }

    /// <summary>What the PDF for this range will hold, for the in-app preview. An empty range has no days.</summary>
    private static async Task<Results<Ok<TranscriptDocument>, ValidationProblem, ForbidHttpResult>> PreviewAsync(
        DateOnly? from, DateOnly? to, string? language, HttpContext http, ITenantContext tenant, TranscriptBuilder builder, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        http.Response.Headers.CacheControl = "no-store";
        var (document, errors) = await BuildAsync(from, to, language, builder, ct);
        return document is null ? TypedResults.ValidationProblem(errors) : TypedResults.Ok(document);
    }

    /// <summary>The range as a PDF, shown in the browser or (<paramref name="download"/>) saved to the device. Nothing is stored.</summary>
    private static async Task<Results<FileContentHttpResult, ValidationProblem, ForbidHttpResult>> PdfAsync(
        DateOnly? from, DateOnly? to, bool? download, string? language, HttpContext http, ITenantContext tenant, TranscriptBuilder builder, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var (document, errors) = await BuildAsync(from, to, language, builder, ct, requireMessages: true);
        return document is null ? TypedResults.ValidationProblem(errors) : Pdf(http, TranscriptPdf.Render(document), document.FileName, download == true);
    }

    /// <summary>Saves an immutable snapshot of the range for this parent.</summary>
    private static async Task<Results<Created<SavedTranscriptView>, ValidationProblem, ForbidHttpResult>> SaveAsync(
        SaveTranscriptRequest request, ITenantContext tenant, TranscriptBuilder builder, MessagingDbContext db, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var (document, errors) = await BuildAsync(request.From, request.To, request.Language, builder, ct, requireMessages: true);
        if (document is null)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var saved = new ChatTranscript(
            tenant.FamilyId,
            tenant.MembershipId,
            document.FileName,
            document.From,
            document.To,
            Label(document),
            document.MessageCount,
            document.PreparedAt,
            TranscriptPdf.Render(document));
        db.Transcripts.Add(saved);
        await db.SaveChangesAsync(ct);
        return TypedResults.Created($"/api/families/{tenant.FamilyId}/chat/transcripts/{saved.Id}/pdf", View(saved));
    }

    /// <summary>This parent's saved transcripts, newest first. The co-parent's saved transcripts aren't listed.</summary>
    private static async Task<Results<Ok<List<SavedTranscriptView>>, ForbidHttpResult>> ListAsync(
        ITenantContext tenant, MessagingDbContext db, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var saved = await db.Transcripts.AsNoTracking()
            .Where(t => t.OwnerMembershipId == tenant.MembershipId)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new SavedTranscriptView(t.Id, t.FileName, t.RangeFrom, t.RangeTo, t.RangeLabel, t.MessageCount, t.CreatedAt))
            .ToListAsync(ct);
        return TypedResults.Ok(saved);
    }

    /// <summary>A saved transcript's PDF, exactly as saved. Another parent's, or another family's, looks like none at all.</summary>
    private static async Task<Results<FileContentHttpResult, NotFound, ForbidHttpResult>> SavedPdfAsync(
        Guid transcriptId, bool? download, HttpContext http, ITenantContext tenant, MessagingDbContext db, CancellationToken ct)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var saved = await db.Transcripts.AsNoTracking()
            .Where(t => t.Id == transcriptId && t.OwnerMembershipId == tenant.MembershipId)
            .Select(t => new { t.FileName, t.Pdf })
            .SingleOrDefaultAsync(ct);
        return saved is null ? TypedResults.NotFound() : Pdf(http, saved.Pdf, saved.FileName, download == true);
    }

    private static async Task<(TranscriptDocument? Document, Dictionary<string, string[]> Errors)> BuildAsync(
        DateOnly? from, DateOnly? to, string? language, TranscriptBuilder builder, CancellationToken ct, bool requireMessages = false)
    {
        var errors = TranscriptRange.Validate(from, to);
        if (errors.Count > 0)
        {
            return (null, errors);
        }

        var document = await builder.BuildAsync(new TranscriptRange(from, to), language, ct);
        if (document is null)
        {
            return (null, new() { ["from"] = [$"That range has more than {TranscriptBuilder.MaxMessages:N0} messages. Choose a shorter range."] });
        }

        return requireMessages && document.MessageCount == 0
            ? (null, new() { ["from"] = ["No messages in this date range."] })
            : (document, errors);
    }

    /// <summary>The list's dates: the chosen range, or for all messages the first and last message dates.</summary>
    private static string Label(TranscriptDocument document) =>
        document.From.HasValue ? document.RangeLabel : document.Labels.Range(document.Days[0].Date, document.Days[^1].Date);

    private static SavedTranscriptView View(ChatTranscript t) =>
        new(t.Id, t.FileName, t.RangeFrom, t.RangeTo, t.RangeLabel, t.MessageCount, t.CreatedAt);

    /// <summary>A private PDF: never cached, never sniffed, shown inline unless the parent asked to download it.</summary>
    private static FileContentHttpResult Pdf(HttpContext http, byte[] pdf, string fileName, bool download)
    {
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Headers.XContentTypeOptions = "nosniff";
        var disposition = new ContentDispositionHeaderValue(download ? "attachment" : "inline");
        disposition.SetHttpFileName(fileName);
        http.Response.Headers.ContentDisposition = disposition.ToString();
        return TypedResults.File(pdf, MediaTypeNames.Application.Pdf);
    }
}
