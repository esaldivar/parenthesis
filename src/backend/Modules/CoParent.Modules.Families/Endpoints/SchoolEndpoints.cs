using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure.Persistence;
using CoParent.Modules.Identity.Contracts;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

/// <summary>School values in display order (#655). The contact and address fields are optional and kept as typed.</summary>
internal sealed record SchoolValues(
    string? Grade, string? HomeroomTeacher, string? ParentConcerns,
    string? SchoolName = null, string? SchoolAddress = null, string? TeacherEmail = null, string? TeacherPhone = null)
{
    public static SchoolValues From(SchoolRevision? row) =>
        new(row?.Grade, row?.HomeroomTeacher, row?.ParentConcerns,
            row?.SchoolName, row?.SchoolAddress, row?.TeacherEmail, row?.TeacherPhone);
}

internal sealed record SchoolView(int Revision, SchoolValues Values)
{
    public static SchoolView From(SchoolRevision? row) => new(row?.Revision ?? 0, SchoolValues.From(row));
}

internal sealed record SaveSchoolRequest(int? Revision, SchoolValues? Values);

internal static class SchoolEndpoints
{
    private static readonly HashSet<string> _homeroomGrades = ["Pre-K", "Kindergarten", "1", "2", "3", "4", "5"];
    private static readonly HashSet<string> _grades = [.. _homeroomGrades, "6", "7", "8", "9", "10", "11", "12"];

    public static void Map(IEndpointRouteBuilder family)
    {
        var school = family.MapGroup("/children/{childId:guid}/essentials/school").WithTags("Child Essentials");
        school.MapGet("", GetAsync);
        school.MapPut("", SaveAsync);
        school.MapGet("/history", HistoryAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (!await ChildEssentialsAccess.IsActiveChildAsync(db, childId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(SchoolView.From(await Revisions(db, childId).FirstOrDefaultAsync(cancellationToken)));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveSchoolRequest request, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUnitOfWork unitOfWork, TimeProvider clock, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Revision is null or < 0 || request.Values is null)
        {
            return TypedResults.BadRequest();
        }

        var errors = new Dictionary<string, string[]>();
        var grade = ChildEssentialsAccess.Normalize(request.Values.Grade, "grade", SchoolRevision.TextLimit, errors);
        var teacher = ChildEssentialsAccess.Normalize(
            request.Values.HomeroomTeacher, "homeroomTeacher", SchoolRevision.TextLimit, errors);
        if (grade is not null && !_grades.Contains(grade))
        {
            errors["grade"] = ["Select a supported school grade."];
        }

        if (teacher is not null && (grade is null || !_homeroomGrades.Contains(grade)))
        {
            errors["homeroomTeacher"] = ["Homeroom teacher is available for pre-K through fifth grade."];
        }

        var email = ChildEssentialsAccess.Normalize(
            request.Values.TeacherEmail, "teacherEmail", SchoolRevision.EmailLimit, errors);
        if (email is not null && !errors.ContainsKey("teacherEmail") && !LooksLikeEmail(email))
        {
            errors["teacherEmail"] = ["Enter an email address like name@example.com."];
        }

        var values = new SchoolValues(
            grade, teacher,
            ChildEssentialsAccess.Normalize(request.Values.ParentConcerns, "parentConcerns", SchoolRevision.TextLimit, errors),
            ChildEssentialsAccess.Normalize(request.Values.SchoolName, "schoolName", SchoolRevision.TextLimit, errors),
            ChildEssentialsAccess.Normalize(request.Values.SchoolAddress, "schoolAddress", SchoolRevision.TextLimit, errors),
            email,
            ChildEssentialsAccess.Normalize(request.Values.TeacherPhone, "teacherPhone", SchoolRevision.PhoneLimit, errors));
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var userId = http.User.GetUserId()!.Value;
        return await unitOfWork.ExecuteAsync<IResult>(async ct =>
        {
            if (!await ChildEssentialsAccess.LockActiveParentAsync(db, tenant, userId, ct) ||
                !await ChildEssentialsAccess.IsActiveChildAsync(db, childId, ct))
            {
                return TypedResults.NotFound();
            }

            var current = SchoolView.From(await Revisions(db, childId).FirstOrDefaultAsync(ct));
            if (request.Revision != current.Revision)
            {
                return TypedResults.Conflict(current);
            }

            if (values == current.Values)
            {
                return TypedResults.Ok(current);
            }

            var next = new SchoolRevision
            {
                FamilyId = tenant.FamilyId,
                ChildProfileId = childId,
                Revision = current.Revision + 1,
                EditedByUserId = userId,
                EditedAt = clock.GetUtcNow(),
                Grade = values.Grade,
                HomeroomTeacher = values.HomeroomTeacher,
                ParentConcerns = values.ParentConcerns,
                SchoolName = values.SchoolName,
                SchoolAddress = values.SchoolAddress,
                TeacherEmail = values.TeacherEmail,
                TeacherPhone = values.TeacherPhone,
            };
            db.SchoolRevisions.Add(next);
            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.School, next.Revision,
                EssentialsUpdateEndpoints.Changed(
                ("schoolName", current.Values.SchoolName, values.SchoolName),
                ("schoolAddress", current.Values.SchoolAddress, values.SchoolAddress),
                ("grade", current.Values.Grade, values.Grade),
                ("homeroomTeacher", current.Values.HomeroomTeacher, values.HomeroomTeacher),
                ("teacherEmail", current.Values.TeacherEmail, values.TeacherEmail),
                ("teacherPhone", current.Values.TeacherPhone, values.TeacherPhone),
                ("parentConcerns", current.Values.ParentConcerns, values.ParentConcerns)),
                next.EditedAt, ct);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(SchoolView.From(next));
        }, cancellationToken);
    }

    private static Task<IResult> HistoryAsync(
        Guid childId, int? beforeRevision, HttpContext http, ITenantContext tenant, FamiliesDbContext db,
        IUserDirectory directory, CancellationToken cancellationToken) =>
        EssentialsHistory.PageAsync(childId, beforeRevision, http, tenant, db, directory, Revisions(db, childId), SchoolValues.From, cancellationToken);

    /// <summary>One @ with text on both sides and no spaces: enough to catch typos without rejecting real addresses.</summary>
    internal static bool LooksLikeEmail(string value)
    {
        var at = value.IndexOf('@');
        return at > 0 && at == value.LastIndexOf('@') && at < value.Length - 1 && !value.Any(char.IsWhiteSpace);
    }

    private static IQueryable<SchoolRevision> Revisions(FamiliesDbContext db, Guid childId) =>
        db.SchoolRevisions.AsNoTracking().Where(row => row.ChildProfileId == childId)
            .OrderByDescending(row => row.Revision);
}
