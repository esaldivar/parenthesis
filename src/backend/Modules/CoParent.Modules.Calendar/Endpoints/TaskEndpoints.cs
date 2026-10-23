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

/// <summary>
/// Create and edit. Edits replace the whole task, checklist included, so clearing the child, the details or the
/// checklist is explicit. An edit must carry the <c>Version</c> the parent saw (#175).
/// </summary>
internal sealed record TaskRequest(
    string? Title,
    DateOnly? DueDate,
    Guid? ChildId,
    string? Details,
    IReadOnlyList<ChecklistItemRequest>? Items = null,
    uint? Version = null);

/// <summary>A checklist line. <c>Id</c> keeps an existing item (and its tick); without one, it's a new item.</summary>
internal sealed record ChecklistItemRequest(Guid? Id, string? Text, bool Required);

internal sealed record TaskSeenView(Guid MembershipId, DateTimeOffset SeenAt);

internal sealed record ChecklistItemView(Guid Id, string Text, bool Required, Guid? CompletedBy, DateTimeOffset? CompletedAt);

/// <summary>
/// A task as a parent sees it. <c>EditedBy</c>: the other parent who last edited it (null when nobody did, or the
/// viewer did), for the quiet "edited by" note. <c>CompletedBy</c>: who marked it done, or whose tick completed its
/// checklist. <c>ProgressDone</c>/<c>ProgressTotal</c> count the items that decide completion (the required ones, or
/// all when none are required). <c>JustCompleted</c> is true only in the response to the change that completed the
/// task, so the app celebrates that moment and no other.
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
    IReadOnlyList<TaskSeenView> SeenBy,
    IReadOnlyList<ChecklistItemView> Items,
    int ProgressDone,
    int ProgressTotal,
    uint Version,
    bool JustCompleted = false);

internal sealed record TaskHistoryView(Guid ActorMembershipId, string Action, string? Changes, DateTimeOffset At);

/// <summary>
/// Shared tasks (#73; #174, and checklists in #175). Either parent creates, edits, deletes, ticks or marks done at
/// once, with no approval; history records who did what. A task with a checklist completes itself when its last
/// deciding item is ticked, and reopens when one is unticked; Mark done is only for tasks without a checklist. Seen is
/// per parent and set only by <c>POST …/seen</c>. Parents only (owner decision, October 22, 2026): child sessions get
/// 403.
/// </summary>
internal static class TaskEndpoints
{
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
        tasks.MapPost("/{taskId:guid}/items/{itemId:guid}/done", TickAsync);
        tasks.MapDelete("/{taskId:guid}/items/{itemId:guid}/done", UntickAsync);
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
        var items = (await db.TaskItems.Where(i => ids.Contains(i.TaskId)).ToListAsync(cancellationToken)).ToLookup(i => i.TaskId);
        return TypedResults.Ok(tasks.Select(t => View(t, tenant, seen, items[t.Id])).ToList());
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
            : TypedResults.Ok(View(
                task, tenant, await LoadSeenAsync(db, taskId, cancellationToken), await LoadItemsAsync(db, taskId, cancellationToken)));
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
        CalendarToday today,
        CancellationToken cancellationToken)
    {
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var errors = await ValidateAsync(request, [], roster, cancellationToken);
        if (errors.Count == 0 && request.DueDate!.Value < today.In(await roster.TimeZoneAsync(cancellationToken)))
        {
            // A new task is due today or later (#232).
            errors["dueDate"] = [CalendarToday.PastDate];
        }

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
            UpdatedAt = now,
        };
        var items = (request.Items ?? []).Select((r, position) => NewItem(task, tenant, r, position)).ToList();
        var userId = http.User.GetUserId();
        await unitOfWork.ExecuteAsync(async ct =>
        {
            db.Tasks.Add(task);
            db.TaskItems.AddRange(items);
            db.TaskHistory.Add(History(task, tenant, SharedTaskAction.Created, null, now));
            await db.SaveChangesAsync(ct);
            await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "task.created", "task", task.Id), ct);
        }, cancellationToken);

        return TypedResults.Created($"/api/families/{tenant.FamilyId}/calendar/tasks/{task.Id}", View(task, tenant, [], items));
    }

    /// <summary>
    /// Either parent, at once, no approval. History records the fields that changed. Refused with 409 when the task
    /// changed since the parent loaded it, so neither parent's change is silently lost. Changing the checklist
    /// recalculates completion: removing the last unticked required item completes the task, adding one reopens it
    /// (owner decision, October 22, 2026).
    /// </summary>
    private static async Task<Results<Ok<TaskView>, NotFound, ValidationProblem, ProblemHttpResult, ForbidHttpResult>> UpdateAsync(
        Guid taskId,
        TaskRequest request,
        HttpContext http,
        ITenantContext tenant,
        CalendarDbContext db,
        IFamilyRoster roster,
        IUnitOfWork unitOfWork,
        IAuditLog audit,
        TimeProvider clock,
        CalendarToday today,
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

        if (request.Version is null)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                ["version"] = ["Send the version of the task you edited."],
            });
        }

        // Checked first: an edit made from an old copy is a conflict to refresh from, not a validation error.
        if (request.Version != task.Version)
        {
            return ChangedConflict();
        }

        var items = await LoadItemsAsync(db, taskId, cancellationToken);
        var errors = await ValidateAsync(request, items, roster, cancellationToken);
        if (errors.Count == 0 && request.DueDate!.Value != task.DueDate
            && request.DueDate.Value < today.In(await roster.TimeZoneAsync(cancellationToken)))
        {
            // Moving it is to today or later; an overdue task keeps its own due date (#232).
            errors["dueDate"] = [CalendarToday.PastDate];
        }

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

        var wanted = request.Items ?? [];
        var checklistChanged = wanted.Count != items.Count || wanted.Select((r, position) => (r, position)).Any(x =>
            items.SingleOrDefault(i => i.Id == x.r.Id) is not { } item ||
            item.Text != x.r.Text!.Trim() || item.Required != x.r.Required || item.Position != x.position);
        if (checklistChanged)
        {
            changes.Add("checklist");
        }

        var seen = await LoadSeenAsync(db, taskId, cancellationToken);
        if (changes.Count == 0)
        {
            return TypedResults.Ok(View(task, tenant, seen, items));
        }

        var now = clock.GetUtcNow();
        (task.Title, task.DueDate, task.ChildProfileId, task.Details) = (title, dueDate, request.ChildId, details);
        (task.LastEditedByMembershipId, task.LastEditedAt, task.UpdatedAt) = (tenant.MembershipId, now, now);
        var history = new List<SharedTaskHistory> { History(task, tenant, SharedTaskAction.Edited, string.Join(", ", changes), now) };
        var removed = items.Where(i => wanted.All(r => r.Id != i.Id)).ToList();
        var kept = new List<TaskChecklistItem>();
        var added = new List<TaskChecklistItem>();
        foreach (var (r, position) in wanted.Select((r, position) => (r, position)))
        {
            if (items.SingleOrDefault(i => i.Id == r.Id) is { } item)
            {
                (item.Text, item.Required, item.Position) = (r.Text!.Trim(), r.Required, position);
                kept.Add(item);
            }
            else
            {
                added.Add(NewItem(task, tenant, r, position));
            }
        }

        var justCompleted = Recalculate(task, [.. kept, .. added], tenant, now, history);
        // As for reminders (owner decision, October 22, 2026): a real change clears the other parent's Seen, so the
        // quiet "edited by" note invites a second look. The editor's own Seen stays.
        var othersSeen = seen.Where(s => s.MembershipId != tenant.MembershipId).ToList();
        var userId = http.User.GetUserId();
        try
        {
            await unitOfWork.ExecuteAsync(async ct =>
            {
                db.TaskItems.RemoveRange(removed);
                db.TaskItems.AddRange(added);
                db.TaskSeen.RemoveRange(othersSeen);
                db.TaskHistory.AddRange(history);
                await db.SaveChangesAsync(ct);
                await audit.RecordAsync(new AuditEntry(tenant.FamilyId, userId, "task.edited", "task", task.Id), ct);
            }, cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return ChangedConflict();
        }

        return TypedResults.Ok(View(task, tenant, seen.Except(othersSeen), [.. kept, .. added], justCompleted));
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
        (task.DeletedAt, task.UpdatedAt) = (now, now);
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
    /// (owner decision, October 22, 2026). Not offered for a task with a checklist: its items decide.
    /// </summary>
    private static Task<Results<Ok<TaskView>, NotFound, ProblemHttpResult, ForbidHttpResult>> MarkDoneAsync(
        Guid taskId, [AsParameters] TaskServices s, CancellationToken cancellationToken) =>
        SetDoneAsync(taskId, done: true, s, cancellationToken);

    /// <summary>Undo Mark done. Either parent can undo; history records who did.</summary>
    private static Task<Results<Ok<TaskView>, NotFound, ProblemHttpResult, ForbidHttpResult>> UndoDoneAsync(
        Guid taskId, [AsParameters] TaskServices s, CancellationToken cancellationToken) =>
        SetDoneAsync(taskId, done: false, s, cancellationToken);

    private static async Task<Results<Ok<TaskView>, NotFound, ProblemHttpResult, ForbidHttpResult>> SetDoneAsync(
        Guid taskId, bool done, TaskServices s, CancellationToken cancellationToken)
    {
        if (s.Tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var task = await FindAsync(s.Db, taskId, cancellationToken);
        if (task is null)
        {
            return TypedResults.NotFound();
        }

        var items = await LoadItemsAsync(s.Db, taskId, cancellationToken);
        if (items.Count > 0)
        {
            return TypedResults.Problem(
                title: "This task has a checklist.",
                detail: "It's done when its checklist is: tick the items instead.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var seen = await LoadSeenAsync(s.Db, taskId, cancellationToken);
        if (done == task.CompletedAt.HasValue)
        {
            return TypedResults.Ok(View(task, s.Tenant, seen, items));
        }

        var now = s.Clock.GetUtcNow();
        (task.CompletedByMembershipId, task.CompletedAt) = done ? (s.Tenant.MembershipId, now) : ((Guid?)null, (DateTimeOffset?)null);
        task.UpdatedAt = now;
        var history = History(task, s.Tenant, done ? SharedTaskAction.Done : SharedTaskAction.Undone, null, now);
        return await SaveAsync(s, task, [history], done ? "task.done" : "task.undone", cancellationToken) is { } conflict
            ? conflict
            : TypedResults.Ok(View(task, s.Tenant, seen, items, justCompleted: done));
    }

    /// <summary>
    /// Tick a checklist item, attributed to the signed-in parent. Already ticked: nothing changes, so one parent can't
    /// take over the other's tick. Ticking the last deciding item completes the task (<c>JustCompleted</c>). Not an
    /// edit: Seen and "edited by" stay.
    /// </summary>
    private static Task<Results<Ok<TaskView>, NotFound, ProblemHttpResult, ForbidHttpResult>> TickAsync(
        Guid taskId, Guid itemId, [AsParameters] TaskServices s, CancellationToken cancellationToken) =>
        SetItemAsync(taskId, itemId, ticked: true, s, cancellationToken);

    /// <summary>
    /// Untick a checklist item. Either parent can, and unticking a deciding item reopens a completed task (owner
    /// decision, October 21, 2026). History records who did it.
    /// </summary>
    private static Task<Results<Ok<TaskView>, NotFound, ProblemHttpResult, ForbidHttpResult>> UntickAsync(
        Guid taskId, Guid itemId, [AsParameters] TaskServices s, CancellationToken cancellationToken) =>
        SetItemAsync(taskId, itemId, ticked: false, s, cancellationToken);

    private static async Task<Results<Ok<TaskView>, NotFound, ProblemHttpResult, ForbidHttpResult>> SetItemAsync(
        Guid taskId, Guid itemId, bool ticked, TaskServices s, CancellationToken cancellationToken)
    {
        if (s.Tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        var task = await FindAsync(s.Db, taskId, cancellationToken);
        var items = task is null ? [] : await LoadItemsAsync(s.Db, taskId, cancellationToken);
        if (task is null || items.SingleOrDefault(i => i.Id == itemId) is not { } item)
        {
            return TypedResults.NotFound();
        }

        var seen = await LoadSeenAsync(s.Db, taskId, cancellationToken);
        if (ticked == item.CompletedAt.HasValue)
        {
            return TypedResults.Ok(View(task, s.Tenant, seen, items));
        }

        var now = s.Clock.GetUtcNow();
        (item.CompletedByMembershipId, item.CompletedAt) = ticked ? (s.Tenant.MembershipId, now) : ((Guid?)null, (DateTimeOffset?)null);
        // Every tick moves the task's version, so two parents' changes to the same task can never cross unseen.
        task.UpdatedAt = now;
        var history = new List<SharedTaskHistory>
        {
            History(task, s.Tenant, ticked ? SharedTaskAction.ItemDone : SharedTaskAction.ItemUndone, item.Id.ToString(), now),
        };
        var justCompleted = Recalculate(task, items, s.Tenant, now, history);
        return await SaveAsync(s, task, history, ticked ? "task.item_done" : "task.item_undone", cancellationToken) is { } conflict
            ? conflict
            : TypedResults.Ok(View(task, s.Tenant, seen, items, justCompleted));
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
            // A change and the completion it caused share a moment: the cause (a tick or an edit) comes first.
            .OrderBy(h => h.At)
            .ThenBy(h => h.Action == SharedTaskAction.Done || h.Action == SharedTaskAction.Undone ? 1 : 0)
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

    /// <summary>
    /// Completes or reopens a task with a checklist to match its items, recording it in history. The deciding items
    /// are the required ones, or all of them when none are required. Returns true when this change completed the task.
    /// A task without a checklist keeps its state (Mark done decides it).
    /// </summary>
    private static bool Recalculate(
        SharedTask task, List<TaskChecklistItem> items, ITenantContext tenant, DateTimeOffset now, List<SharedTaskHistory> history)
    {
        if (items.Count == 0)
        {
            return false;
        }

        var complete = Deciding(items).All(i => i.CompletedAt.HasValue);
        if (complete && task.CompletedAt is null)
        {
            (task.CompletedByMembershipId, task.CompletedAt) = (tenant.MembershipId, now);
            history.Add(History(task, tenant, SharedTaskAction.Done, null, now));
            return true;
        }

        if (!complete && task.CompletedAt is not null)
        {
            (task.CompletedByMembershipId, task.CompletedAt) = (null, null);
            history.Add(History(task, tenant, SharedTaskAction.Undone, null, now));
        }

        return false;
    }

    private static IEnumerable<TaskChecklistItem> Deciding(List<TaskChecklistItem> items) =>
        items.Any(i => i.Required) ? items.Where(i => i.Required) : items;

    /// <summary>Saves a tick or Mark done; null when it worked, or a 409 when the other parent changed the task first.</summary>
    private static async Task<ProblemHttpResult?> SaveAsync(
        TaskServices s, SharedTask task, IReadOnlyList<SharedTaskHistory> history, string action, CancellationToken cancellationToken)
    {
        var userId = s.Http.User.GetUserId();
        try
        {
            await s.UnitOfWork.ExecuteAsync(async ct =>
            {
                s.Db.TaskHistory.AddRange(history);
                await s.Db.SaveChangesAsync(ct);
                await s.Audit.RecordAsync(new AuditEntry(s.Tenant.FamilyId, userId, action, "task", task.Id), ct);
            }, cancellationToken);
            return null;
        }
        catch (DbUpdateConcurrencyException)
        {
            return ChangedConflict();
        }
    }

    private static ProblemHttpResult ChangedConflict() => TypedResults.Problem(
        title: "The other parent just changed this task.",
        detail: "Refresh to see their change, then try again.",
        statusCode: StatusCodes.Status409Conflict);

    private static Task<SharedTask?> FindAsync(CalendarDbContext db, Guid taskId, CancellationToken cancellationToken) =>
        db.Tasks.SingleOrDefaultAsync(t => t.Id == taskId && t.DeletedAt == null, cancellationToken);

    private static Task<List<SharedTaskSeen>> LoadSeenAsync(CalendarDbContext db, Guid taskId, CancellationToken cancellationToken) =>
        db.TaskSeen.Where(s => s.TaskId == taskId).ToListAsync(cancellationToken);

    private static Task<List<TaskChecklistItem>> LoadItemsAsync(CalendarDbContext db, Guid taskId, CancellationToken cancellationToken) =>
        db.TaskItems.Where(i => i.TaskId == taskId).OrderBy(i => i.Position).ToListAsync(cancellationToken);

    private static async Task<Dictionary<string, string[]>> ValidateAsync(
        TaskRequest request, IReadOnlyList<TaskChecklistItem> existing, IFamilyRoster roster, CancellationToken cancellationToken)
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

        var items = request.Items ?? [];
        if (items.Count > TaskChecklistItem.MaxPerTask)
        {
            errors["items"] = [$"Keep the checklist to {TaskChecklistItem.MaxPerTask} items."];
        }
        else if (items.Any(i => (i.Text?.Trim().Length ?? 0) is 0 or > TaskChecklistItem.TextMaxLength))
        {
            errors["items"] = [$"Give each checklist item 1 to {TaskChecklistItem.TextMaxLength} characters."];
        }
        else if (items.Any(i => i.Id is { } id && existing.All(e => e.Id != id)) ||
            items.Where(i => i.Id is not null).GroupBy(i => i.Id).Any(g => g.Count() > 1))
        {
            // An id the task doesn't have is never trusted: new items come without one.
            errors["items"] = ["The checklist changed. Refresh and try again."];
        }

        return errors;
    }

    private static string? Clean(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static TaskChecklistItem NewItem(SharedTask task, ITenantContext tenant, ChecklistItemRequest r, int position) => new()
    {
        FamilyId = tenant.FamilyId,
        TaskId = task.Id,
        Text = r.Text!.Trim(),
        Required = r.Required,
        Position = position,
    };

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

    private static TaskView View(
        SharedTask t,
        ITenantContext tenant,
        IEnumerable<SharedTaskSeen> seen,
        IEnumerable<TaskChecklistItem> items,
        bool justCompleted = false)
    {
        var list = items.OrderBy(i => i.Position).ToList();
        var deciding = list.Count == 0 ? [] : Deciding(list).ToList();
        return new TaskView(
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
            seen.Where(s => s.TaskId == t.Id).OrderBy(s => s.SeenAt).Select(s => new TaskSeenView(s.MembershipId, s.SeenAt)).ToList(),
            list.Select(i => new ChecklistItemView(i.Id, i.Text, i.Required, i.CompletedByMembershipId, i.CompletedAt)).ToList(),
            deciding.Count(i => i.CompletedAt.HasValue),
            deciding.Count,
            t.Version,
            justCompleted);
    }

    /// <summary>The services a tick or Mark done needs.</summary>
    internal sealed record TaskServices(
        HttpContext Http,
        ITenantContext Tenant,
        CalendarDbContext Db,
        IUnitOfWork UnitOfWork,
        IAuditLog Audit,
        TimeProvider Clock);
}
