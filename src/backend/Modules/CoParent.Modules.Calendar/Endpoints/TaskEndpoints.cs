using CoParent.Modules.Calendar.Domain;
using CoParent.Modules.Calendar.Infrastructure;
using CoParent.Modules.Families.Contracts;
using CoParent.SharedKernel.Auditing;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Calendar.Endpoints;

/// <summary>Create and edit (edits replace the whole task, so clearing the child or details is explicit).</summary>
internal sealed record TaskRequest(string? Title, DateOnly? DueDate, Guid? ChildId, string? Details);

internal sealed record TaskSeenView(Guid MembershipId, DateTimeOffset SeenAt);

/// <summary>
/// A task as a parent sees it. <c>EditedBy</c>: the other parent who last edited it (null when nobody did, or the
/// viewer did), for the quiet "edited by" note. <c>CompletedBy</c>: who marked it done, whoever is looking.
/// </summary>
internal sealed record TaskView(
    Guid Id,
    string Title,
    DateOnly DueDate,
    Guid? ChildId,
    string? Details,
    Guid CreatedByMembershipId,
    DateTimeOffset CreatedAt,
    Guid? EditedBy,
    DateTimeOffset? LastEditedAt,
    Guid? CompletedBy,
    DateTimeOffset? CompletedAt,
    IReadOnlyList<TaskSeenView> SeenBy);

internal sealed record TaskHistoryView(Guid ActorMembershipId, string Action, string? Changes, DateTimeOffset At);

/// <summary>
/// Shared tasks (#73, part 1: #174). Either parent creates, edits, deletes or marks done at once, with no approval;
/// history records who did what. Seen is per parent and set only by <c>POST …/seen</c>, which the app calls when a
/// parent opens the details. Parents only (owner decision, October 22, 2026): child sessions get 403.
/// </summary>
internal static class TaskEndpoints
{
    /// <summary>The longest date range one list call may ask for.</summary>
    private static int MaxRangeDays => (int)CalendarEndpoints.MaxRange.TotalDays;

    public static void Map(IEndpointRouteBuilder family)
    {
        var tasks = family.MapGroup("/calendar/tasks").WithTags("Calendar");
        tasks.MapGet("/", ListAsync);
        tasks.MapPost("/", CreateAsync);
        tasks.MapGet("/{taskId:guid}", GetAsync);
        tasks.MapPut("/{taskId:guid}", UpdateAsync);
        tasks.MapDelete("/{taskId:guid}", DeleteAsync);
        tasks.MapGet("/{taskId:guid}/history", HistoryAsync);
        tasks.MapPost("/{taskId:guid}/seen", MarkSeenAsync);
        tasks.MapPost("/{taskId:guid}/done", MarkDoneAsync);
        tasks.MapDelete("/{taskId:guid}/done", UndoDoneAsync);
    }

    /// <summary>Tasks due in [from, to), as local dates. Never marks anything seen.</summary>
    private static async Task<Results<Ok<List<TaskView>>, ValidationProblem, ForbidHttpResult>> ListAsync(
        DateOnly from, DateOnly to, ITenantContext tenant, CalendarDbContext db, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (to <= from || to.DayNumber - from.DayNumber > MaxRangeDays)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["to"] = [$"Choose a range that ends after it starts and spans at most {MaxRangeDays} days."],
            });
        }

        var tasks = await db.Tasks
            .Where(t => t.DeletedAt == null && t.DueDate >= from && t.DueDate < to)
            .OrderBy(t => t.DueDate).ThenBy(t => t.CreatedAt)
            .ToListAsync(cancellationToken);
        var ids = tasks.Select(t => t.Id).ToList();
        var seen = await db.TaskSeen.Where(s => ids.Contains(s.TaskId)).ToListAsync(cancellationToken);
        return TypedResults.Ok(tasks.Select(t => View(t, tenant, seen)).ToList());
    }

    private static async Task<Results<Ok<TaskView>, NotFound, ForbidHttpResult>> GetAsync(
        Guid taskId, ITenantContext tenant, CalendarDbContext db, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var task = await FindAsync(db, taskId, cancellationToken);
        return task is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(View(task, tenant, await LoadSeenAsync(db, taskId, cancellationToken)));
    }

    private static async Task<Results<Created<TaskView>, ValidationProblem, ForbidHttpResult>> CreateAsync(
        TaskRequest request,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var errors = await ValidateAsync(request, roster, cancellationToken);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var now = clock.GetUtcNow();
        var task = new SharedTask
        {
            FamilyId = tenant.FamilyId,
            Title = request.Title!.Trim(),
            DueDate = request.DueDate!.Value,
            ChildProfileId = request.ChildId,
            Details = Clean(request.Details),
            CreatedByMembershipId = tenant.MembershipId,
            CreatedAt = now,
        };
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.Tasks.Add(task);
            db.TaskHistory.Add(History(task, tenant, SharedTaskAction.Created, null, now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "task.created", "task", task.Id), ct);
        }, cancellationToken);

        return TypedResults.Created($"/api/families/{tenant.FamilyId}/calendar/tasks/{task.Id}", View(task, tenant, []));
    }

    /// <summary>Either parent, at once, no approval. History records the fields that changed.</summary>
    private static async Task<Results<Ok<TaskView>, NotFound, ValidationProblem, ForbidHttpResult>> UpdateAsync(
        Guid taskId,
        TaskRequest request,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var task = await FindAsync(db, taskId, cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        var errors = await ValidateAsync(request, roster, cancellationToken);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var title = request.Title!.Trim();
        var dueDate = request.DueDate!.Value;
        var details = Clean(request.Details);
        var changes = new List<string>();
        if (title != task.Title)
        {
            changes.Add("title");
        }

        if (dueDate != task.DueDate)
        {
            changes.Add("dueDate");
        }

        if (request.ChildId != task.ChildProfileId)
        {
            changes.Add("child");
        }

        if (details != task.Details)
        {
            changes.Add("details");
        }

        var seen = await LoadSeenAsync(db, taskId, cancellationToken);
        if (changes.Count == 0)
        {
            return TypedResults.Ok(View(task, tenant, seen));
        }

        var now = clock.GetUtcNow();
        (task.Title, task.DueDate, task.ChildProfileId, task.Details) = (title, dueDate, request.ChildId, details);
        (task.LastEditedByMembershipId, task.LastEditedAt) = (tenant.MembershipId, now);
        // As for reminders (owner decision, October 22, 2026): a real change clears the other parent's Seen, so the
        // quiet "edited by" note invites a second look. The editor's own Seen stays.
        var othersSeen = seen.Where(s => s.MembershipId != tenant.MembershipId).ToList();
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.TaskSeen.RemoveRange(othersSeen);
            db.TaskHistory.Add(History(task, tenant, SharedTaskAction.Edited, string.Join(", ", changes), now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "task.edited", "task", task.Id), ct);
        }, cancellationToken);

        return TypedResults.Ok(View(task, tenant, seen.Except(othersSeen)));
    }

    /// <summary>Either parent, at once, no approval. The row is kept (marked deleted) so its history stays.</summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> DeleteAsync(
        Guid taskId,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var task = await FindAsync(db, taskId, cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        var now = clock.GetUtcNow();
        task.DeletedAt = now;
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.TaskHistory.Add(History(task, tenant, SharedTaskAction.Deleted, null, now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "task.deleted", "task", task.Id), ct);
        }, cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// Mark done, attributed to the signed-in parent (never to anyone named in the request). Already done: nothing
    /// changes, so one parent can't take over the other's completion. Not an edit: Seen and "edited by" stay
    /// (owner decision, October 22, 2026).
    /// </summary>
    private static Task<Results<Ok<TaskView>, NotFound, ForbidHttpResult>> MarkDoneAsync(
        Guid taskId,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken) =>
        SetDoneAsync(taskId, done: true, http, tenant, db, unitOfWork, audit, clock, cancellationToken);

    /// <summary>Undo Mark done. Either parent can undo; history records who did.</summary>
    private static Task<Results<Ok<TaskView>, NotFound, ForbidHttpResult>> UndoDoneAsync(
        Guid taskId,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken) =>
        SetDoneAsync(taskId, done: false, http, tenant, db, unitOfWork, audit, clock, cancellationToken);

    private static async Task<Results<Ok<TaskView>, NotFound, ForbidHttpResult>> SetDoneAsync(
        Guid taskId,
        bool done,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var task = await FindAsync(db, taskId, cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        var seen = await LoadSeenAsync(db, taskId, cancellationToken);
        if (done == task.CompletedAt.HasValue)
        {
            return TypedResults.Ok(View(task, tenant, seen));
        }

        var now = clock.GetUtcNow();
        (task.CompletedByMembershipId, task.CompletedAt) = done ? (tenant.MembershipId, now) : ((Guid?)null, (DateTimeOffset?)null);
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.TaskHistory.Add(History(task, tenant, done ? SharedTaskAction.Done : SharedTaskAction.Undone, null, now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(
                new AuditEntry(tenant.FamilyId, userId, done ? "task.done" : "task.undone", "task", task.Id), ct);
        }, cancellationToken);
        return TypedResults.Ok(View(task, tenant, seen));
    }

    private static async Task<Results<Ok<List<TaskHistoryView>>, NotFound, ForbidHttpResult>> HistoryAsync(
        Guid taskId, ITenantContext tenant, CalendarDbContext db, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (await FindAsync(db, taskId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var history = await db.TaskHistory
            .Where(h => h.TaskId == taskId)
            .OrderBy(h => h.At)
            .Select(h => new TaskHistoryView(h.ActorMembershipId, h.Action.ToString(), h.Changes, h.At))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(history);
    }

    /// <summary>
    /// The caller opened the details on purpose. Only ever sets the caller's own Seen: the membership comes from the
    /// signed-in session, never from the request.
    /// </summary>
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> MarkSeenAsync(
        Guid taskId, ITenantContext tenant, CalendarDbContext db, TimeProvider clock, CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (await FindAsync(db, taskId, cancellationToken) is null)
        {
            return TypedResults.NotFound();
        }

        var now = clock.GetUtcNow();
        var mine = await db.TaskSeen.SingleOrDefaultAsync(
            s => s.TaskId == taskId && s.MembershipId == tenant.MembershipId, cancellationToken);
        if (mine is null)
        {
            db.TaskSeen.Add(new SharedTaskSeen
            {
                FamilyId = tenant.FamilyId,
                TaskId = taskId,
                MembershipId = tenant.MembershipId,
                SeenAt = now,
            });
        }
        else
        {
            mine.SeenAt = now;
        }

        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static Task<SharedTask?> FindAsync(CalendarDbContext db, Guid taskId, CancellationToken cancellationToken) =>
        db.Tasks.SingleOrDefaultAsync(t => t.Id == taskId && t.DeletedAt == null, cancellationToken);

    private static Task<List<SharedTaskSeen>> LoadSeenAsync(CalendarDbContext db, Guid taskId, CancellationToken cancellationToken) =>
        db.TaskSeen.Where(s => s.TaskId == taskId).ToListAsync(cancellationToken);

    private static async Task<Dictionary<string, string[]>> ValidateAsync(
        TaskRequest request, IFamilyRoster roster, CancellationToken cancellationToken)
    {
        var errors = new Dictionary<string, string[]>();
        var title = request.Title?.Trim() ?? "";
        if (title.Length is 0 or > SharedTask.TitleMaxLength)
        {
            errors["title"] = [$"Enter a title of 1 to {SharedTask.TitleMaxLength} characters."];
        }

        if (request.DueDate is null)
        {
            errors["dueDate"] = ["Choose the day it's due."];
        }

        if ((request.Details?.Trim().Length ?? 0) > SharedTask.DetailsMaxLength)
        {
            errors["details"] = [$"Keep the details under {SharedTask.DetailsMaxLength} characters."];
        }

        if (request.ChildId is { } child && !(await roster.ActiveChildIdsAsync(cancellationToken)).Contains(child))
        {
            errors["childId"] = ["Choose a child who's in this family (and approved by both parents)."];
        }

        return errors;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static SharedTaskHistory History(
        SharedTask task, ITenantContext tenant, SharedTaskAction action, string? changes, DateTimeOffset at) => new()
        {
            FamilyId = tenant.FamilyId,
            TaskId = task.Id,
            ActorMembershipId = tenant.MembershipId,
            Action = action,
            Changes = changes,
            At = at,
        };

    private static TaskView View(SharedTask t, ITenantContext tenant, IEnumerable<SharedTaskSeen> seen) => new(
        t.Id,
        t.Title,
        t.DueDate,
        t.ChildProfileId,
        t.Details,
        t.CreatedByMembershipId,
        t.CreatedAt,
        EditedBy: t.LastEditedByMembershipId is { } editor && editor != tenant.MembershipId ? editor : null,
        t.LastEditedAt,
        t.CompletedByMembershipId,
        t.CompletedAt,
        seen.Where(s => s.TaskId == t.Id).OrderBy(s => s.SeenAt).Select(s => new TaskSeenView(s.MembershipId, s.SeenAt)).ToList());
}
