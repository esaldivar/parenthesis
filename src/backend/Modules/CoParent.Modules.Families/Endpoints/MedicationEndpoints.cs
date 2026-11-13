using System.Globalization;
using System.Net.Mime;
using System.Text.Json;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure.Pdf;
using CoParent.Modules.Families.Infrastructure.Persistence;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

/// <summary>One stored medication entry: what a parent entered, and who last changed it and when.</summary>
internal sealed record MedicationEntry(
    Guid Id, string Name, string? Dose, string? Schedule, string? Instructions, bool Discontinued,
    Guid UpdatedByUserId, DateTimeOffset UpdatedAt)
{
    public MedicationValues ToValues() => new(Id, Name, Dose, Schedule, Instructions, Discontinued);
}

/// <summary>An entry's values, as a parent enters them and as history shows them (no account ids).</summary>
internal sealed record MedicationValues(Guid Id, string? Name, string? Dose, string? Schedule, string? Instructions, bool Discontinued);

internal sealed record MedicationItem(
    Guid Id, string Name, string? Dose, string? Schedule, string? Instructions, bool Discontinued,
    string UpdatedBy, DateTimeOffset UpdatedAt);

/// <summary>A child's medication reference. <c>Acknowledged</c>: this parent has confirmed the medication notice.</summary>
internal sealed record MedicationView(int Revision, bool Acknowledged, IReadOnlyList<MedicationItem> Entries);

/// <summary>The whole list, with every saved entry still in it: removing one is a separate permanent delete.</summary>
internal sealed record SaveMedicationRequest(int? Revision, IReadOnlyList<MedicationValues?>? Entries, bool Acknowledge);

/// <summary>
/// A parent-entered medication reference for each child (#127): name, prescribed dose, schedule and instructions,
/// current or discontinued, with history. No dose calculations, recommendations, reminders, tracking or email.
/// Parents only; either parent edits without approval. Before a parent's first save they confirm the notice once.
/// Permanent delete removes the entry from every revision. Update notices and audit records hold ids, never values.
/// Decisions: docs/privacy/medication-preflight-127.md.
/// </summary>
internal static class MedicationEndpoints
{
    public const int EntryLimit = 30;
    public const int NameLimit = 100;
    public const int DoseLimit = 100;
    public const int ScheduleLimit = 200;
    public const int InstructionsLimit = 1000;

    public static void Map(IEndpointRouteBuilder family)
    {
        family.MapGet("/child-essentials/medication/pdf", DownloadPdfAsync).WithTags("Child Essentials");
        var medication = family.MapGroup("/children/{childId:guid}/essentials/medication").WithTags("Child Essentials");
        medication.MapGet("", GetAsync);
        medication.MapPut("", SaveAsync);
        medication.MapGet("/history", HistoryAsync);
        medication.MapDelete("/{entryId:guid}", DeleteAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUserDirectory directory,
        CancellationToken ct)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct))
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(await CurrentViewAsync(db, tenant, directory, childId, ct));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveMedicationRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUnitOfWork work, TimeProvider clock, IUserDirectory directory, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Revision is null or < 0 || request.Entries is null or { Count: > EntryLimit })
        {
            return TypedResults.BadRequest();
        }

        var errors = new Dictionary<string, string[]>();
        var entries = new List<MedicationValues>();
        var ids = new HashSet<Guid>();
        foreach (var entry in request.Entries)
        {
            if (entry is null || entry.Id == Guid.Empty || !ids.Add(entry.Id))
            {
                errors["entries"] = ["Each medication must have a unique identifier."];
                continue;
            }

            if (Normalize(entry, errors) is { } normalized)
            {
                entries.Add(normalized);
            }
        }

        if (errors.Count != 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var userId = http.User.GetUserId()!.Value;
        return await work.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct) ||
                !await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct))
            {
                return TypedResults.NotFound();
            }

            var acknowledged = await IsAcknowledgedAsync(db, tenant, ct);
            if (!acknowledged && !request.Acknowledge)
            {
                return TypedResults.Problem(
                    statusCode: StatusCodes.Status428PreconditionRequired,
                    title: "Confirm the medication notice before saving.");
            }

            var now = clock.GetUtcNow();
            if (!acknowledged)
            {
                db.MedicationAcknowledgements.Add(new MedicationAcknowledgement
                {
                    FamilyId = tenant.FamilyId,
                    MembershipId = tenant.MembershipId,
                    AcknowledgedAt = now,
                    NoticeVersion = MedicationAcknowledgement.CurrentNoticeVersion,
                });
            }

            var latest = await Revisions(db, childId).FirstOrDefaultAsync(ct);
            var revision = latest?.Revision ?? 0;
            var current = Entries(latest);
            if (entries.SequenceEqual(current.Select(item => item.ToValues())))
            {
                await db.SaveChangesAsync(ct);
                return TypedResults.Ok(await CurrentViewAsync(db, tenant, directory, childId, ct));
            }

            if (request.Revision != revision)
            {
                await db.SaveChangesAsync(ct);
                return TypedResults.Conflict(await CurrentViewAsync(db, tenant, directory, childId, ct));
            }

            if (current.Any(saved => !ids.Contains(saved.Id)))
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["entries"] = ["Use Delete permanently to remove a medication."],
                });
            }

            var byId = current.ToDictionary(item => item.Id);
            var next = entries.Select(values => byId.TryGetValue(values.Id, out var saved) && saved.ToValues() == values
                ? saved
                : new MedicationEntry(values.Id, values.Name!, values.Dose, values.Schedule, values.Instructions,
                    values.Discontinued, userId, now)).ToList();
            AddRevision(db, tenant, userId, childId, revision + 1, next, now);
            // The other parent's notice (#128): the entries added or changed, by id only.
            var changed = next.Where(item => !byId.TryGetValue(item.Id, out var saved) || saved != item)
                .Select(item => item.Id.ToString()).ToList();
            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.Medication, revision + 1,
                changed, now, ct);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(await CurrentViewAsync(db, tenant, directory, childId, ct));
        }, cancellationToken);
    }

    /// <summary>
    /// Deletes an entry permanently (preflight D7): either parent, without approval. The entry leaves every revision
    /// and every update notice; a revision that only changed it goes too. A new revision records who deleted an entry
    /// and when, so history and the other parent's notice say "A medication entry was deleted" without its details.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid childId, Guid entryId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work,
        TimeProvider clock, IUserDirectory directory, IAuditLog audit, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var userId = http.User.GetUserId()!.Value;
        return await work.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct) ||
                !await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct))
            {
                return TypedResults.NotFound();
            }

            var rows = await db.MedicationRevisions.Where(row => row.ChildProfileId == childId)
                .OrderBy(row => row.Revision).ToListAsync(ct);
            if (rows.Count == 0 || Entries(rows[^1]).All(item => item.Id != entryId))
            {
                return TypedResults.NotFound();
            }

            List<MedicationEntry> previousOriginal = [];
            List<MedicationEntry> previousStripped = [];
            foreach (var row in rows)
            {
                var original = Entries(row).ToList();
                var stripped = original.Where(item => item.Id != entryId).ToList();
                if (!original.SequenceEqual(previousOriginal) && stripped.SequenceEqual(previousStripped))
                {
                    // This save only changed the deleted entry.
                    db.MedicationRevisions.Remove(row);
                }
                else if (stripped.Count != original.Count)
                {
                    row.EntriesJson = JsonSerializer.Serialize(stripped);
                }

                previousOriginal = original;
                previousStripped = stripped;
            }

            var id = entryId.ToString();
            foreach (var update in await db.EssentialsUpdates
                         .Where(u => u.ChildProfileId == childId && u.Section == EssentialsSections.Medication)
                         .ToListAsync(ct))
            {
                if (update.Fields.All(field => field == id))
                {
                    db.EssentialsUpdates.Remove(update);
                }
                else if (update.Fields.Contains(id) || update.PendingFields.Contains(id))
                {
                    update.PendingFields = update.PendingFields.Where(field => field != id).ToList();
                    db.Entry(update).Property(u => u.Fields).CurrentValue = update.Fields.Where(field => field != id).ToList();
                }
            }

            var now = clock.GetUtcNow();
            var revision = rows[^1].Revision + 1;
            AddRevision(db, tenant, userId, childId, revision, previousStripped, now);
            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.Medication, revision,
                ["deleted"], now, ct, rows: []);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "medication.deleted", "medication_entry", entryId), ct);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(await CurrentViewAsync(db, tenant, directory, childId, ct));
        }, cancellationToken);
    }

    private static async Task<IResult> DownloadPdfAsync(
        Guid? childId, bool? currentOnly, string? language, HttpContext http, ITenantContext tenant,
        FamiliesDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        http.Response.Headers.XContentTypeOptions = "nosniff";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var spanish = string.Equals(language, "es-419", StringComparison.OrdinalIgnoreCase);
        http.Response.Headers.ContentLanguage = spanish ? "es-419" : "en";
        var children = await db.Children.AsNoTracking()
            .Where(child => child.Status == ChildStatus.Active && (childId == null || child.Id == childId))
            .OrderBy(child => child.FirstName).ThenBy(child => child.Id)
            .Select(child => new
            {
                child.FirstName,
                Json = db.MedicationRevisions.Where(row => row.ChildProfileId == child.Id)
                    .OrderByDescending(row => row.Revision).Select(row => row.EntriesJson).FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);
        if (children.Count == 0)
        {
            return TypedResults.NotFound();
        }

        var sections = children.Select(child =>
        {
            var entries = Parse(child.Json);
            return new MedicationPdfSection(
                child.FirstName,
                entries.Where(item => !item.Discontinued).ToList(),
                currentOnly == true ? null : entries.Where(item => item.Discontinued).ToList());
        }).ToList();
        var generatedAt = clock.GetUtcNow();
        var date = generatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        // The backend runs with invariant globalization; named cultures are unavailable.
        var displayDate = generatedAt.ToString(spanish ? "dd/MM/yyyy" : "yyyy-MM-dd", CultureInfo.InvariantCulture);
        return TypedResults.File(MedicationPdf.Render(sections, generatedAt, displayDate, spanish),
            MediaTypeNames.Application.Pdf, $"medications-{date}.pdf");
    }

    private static Task<IResult> HistoryAsync(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken ct) =>
        EssentialsHistory.PageAsync(childId, beforeRevision, http, tenant, db, directory, Revisions(db, childId),
            row => Entries(row).Select(item => item.ToValues()).ToList(), ct);

    private static MedicationValues? Normalize(MedicationValues entry, Dictionary<string, string[]> errors)
    {
        var name = ChildEssentialsAccess.Normalize(entry.Name, "name", NameLimit, errors);
        var dose = ChildEssentialsAccess.Normalize(entry.Dose, "dose", DoseLimit, errors);
        var schedule = ChildEssentialsAccess.Normalize(entry.Schedule, "schedule", ScheduleLimit, errors);
        var instructions = ChildEssentialsAccess.Normalize(entry.Instructions, "instructions", InstructionsLimit, errors);
        if (name is null)
        {
            errors["name"] = ["Enter a medication name."];
            return null;
        }

        return entry with { Name = name, Dose = dose, Schedule = schedule, Instructions = instructions };
    }

    private static Task<bool> IsAcknowledgedAsync(FamiliesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        db.MedicationAcknowledgements.AnyAsync(a => a.MembershipId == tenant.MembershipId &&
            a.NoticeVersion == MedicationAcknowledgement.CurrentNoticeVersion, ct);

    private static async Task<MedicationView> CurrentViewAsync(
        FamiliesDbContext db, ITenantContext tenant, IUserDirectory directory, Guid childId, CancellationToken ct)
    {
        var latest = await Revisions(db, childId).FirstOrDefaultAsync(ct);
        var entries = Entries(latest);
        var names = await directory.GetDisplayNamesAsync(entries.Select(item => item.UpdatedByUserId).Distinct().ToList(), ct);
        return new MedicationView(
            latest?.Revision ?? 0,
            await IsAcknowledgedAsync(db, tenant, ct),
            entries.Select(item => new MedicationItem(item.Id, item.Name, item.Dose, item.Schedule, item.Instructions,
                item.Discontinued, names.GetValueOrDefault(item.UpdatedByUserId, "A parent"), item.UpdatedAt)).ToList());
    }

    private static void AddRevision(
        FamiliesDbContext db, ITenantContext tenant, Guid userId, Guid childId, int revision,
        IReadOnlyList<MedicationEntry> entries, DateTimeOffset now) =>
        db.MedicationRevisions.Add(new MedicationRevision
        {
            FamilyId = tenant.FamilyId,
            ChildProfileId = childId,
            Revision = revision,
            EditedByUserId = userId,
            EditedAt = now,
            EntriesJson = JsonSerializer.Serialize(entries),
        });

    private static MedicationEntry[] Entries(MedicationRevision? row) => Parse(row?.EntriesJson);

    private static MedicationEntry[] Parse(string? json) =>
        json is null ? [] : JsonSerializer.Deserialize<MedicationEntry[]>(json) ?? [];

    private static IQueryable<MedicationRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.MedicationRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId)
            .OrderByDescending(row => row.Revision);
}
