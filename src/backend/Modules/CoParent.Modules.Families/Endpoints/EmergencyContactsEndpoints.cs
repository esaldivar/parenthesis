using System.Text.Json;
using CoParent.Modules.Families.Domain;
using CoParent.Modules.Families.Infrastructure;
using CoParent.SharedKernel.Persistence;
using CoParent.SharedKernel.Security;
using CoParent.SharedKernel.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Families.Endpoints;

internal sealed record EmergencyContact(string Name, string Relationship, string Phone, string? Address, bool CallFirst);
internal sealed record EmergencyContactsView(int Version, IReadOnlyList<EmergencyContact> Contacts);
internal sealed record SaveEmergencyContactsRequest(int? Version, IReadOnlyList<EmergencyContact?>? Contacts);

internal static class EmergencyContactsEndpoints
{
    public static void Map(IEndpointRouteBuilder family)
    {
        var contacts = family.MapGroup("/children/{childId:guid}/essentials/emergency-contacts").WithTags("Child Essentials");
        contacts.MapGet("", GetAsync);
        contacts.MapPut("", SaveAsync);
    }

    private static async Task<IResult> GetAsync(
        Guid childId, HttpContext http, ITenantContext tenant, FamiliesDbContext db, CancellationToken ct)
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

        return TypedResults.Ok(View(await db.EmergencyContacts.AsNoTracking().SingleOrDefaultAsync(row => row.ChildProfileId == childId, ct)));
    }

    private static async Task<IResult> SaveAsync(
        Guid childId, SaveEmergencyContactsRequest request, HttpContext http,
        ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work, CancellationToken cancellationToken)
    {
        http.Response.Headers.CacheControl = "no-store";
        if (tenant.Role != FamilyRole.Parent)
        {
            return TypedResults.Forbid();
        }

        if (request.Version is null or < 0 || request.Contacts is null or { Count: > 30 })
        {
            return TypedResults.BadRequest();
        }

        var errors = new Dictionary<string, string[]>();
        var contacts = new List<EmergencyContact>();
        var phones = new HashSet<string>(StringComparer.Ordinal);
        foreach (var contact in request.Contacts)
        {
            var name = ChildEssentialsAccess.Normalize(contact?.Name, "name", 100, errors);
            var relationship = ChildEssentialsAccess.Normalize(contact?.Relationship, "relationship", 100, errors);
            var phone = ChildEssentialsAccess.Normalize(contact?.Phone, "phone", 32, errors);
            var address = ChildEssentialsAccess.Normalize(contact?.Address, "address", 300, errors);
            if (contact is null || name is null || relationship is null || phone is null)
            {
                errors["contacts"] = ["Enter a name, relationship, and phone number for each contact."];
                continue;
            }

            var digits = new string(phone.Where(char.IsAsciiDigit).ToArray());
            if (digits.Length is < 7 or > 15 || phone.Any(c => !char.IsAsciiDigit(c) && c is not ('+' or ' ' or '-' or '(' or ')' or '.')))
            {
                errors["phone"] = ["Enter a phone number with 7 to 15 digits."];
            }
            else if (!phones.Add(digits))
            {
                errors["phone"] = ["That phone number is already on this child’s emergency contact list."];
            }

            contacts.Add(new(name, relationship, phone, address, contact.CallFirst));
        }

        if (contacts.Count(contact => contact.CallFirst) > 1)
        {
            errors["callFirst"] = ["Select one Call first contact per child."];
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

            var row = await db.EmergencyContacts.SingleOrDefaultAsync(item => item.ChildProfileId == childId, ct);
            var current = View(row);
            if (request.Version != current.Version)
            {
                return TypedResults.Conflict(current);
            }

            contacts = contacts.OrderByDescending(contact => contact.CallFirst).ToList();
            if (contacts.SequenceEqual(current.Contacts))
            {
                return TypedResults.Ok(current);
            }

            if (row is null)
            {
                row = new EmergencyContacts { FamilyId = tenant.FamilyId, ChildProfileId = childId };
                db.EmergencyContacts.Add(row);
            }

            row.Version++;
            row.ContactsJson = JsonSerializer.Serialize(contacts);
            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(new EmergencyContactsView(row.Version, contacts));
        }, cancellationToken);
    }

    private static EmergencyContactsView View(EmergencyContacts? row) =>
        row is null ? new(0, []) : new(row.Version, JsonSerializer.Deserialize<EmergencyContact[]>(row.ContactsJson) ?? []);
}
