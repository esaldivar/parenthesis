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

internal sealed record EmergencyContact(string Name, string Relationship, string Phone, string? Address, bool CallFirst, Guid? Id = null);
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
        ITenantContext tenant, FamiliesDbContext db, IUnitOfWork work, TimeProvider clock, CancellationToken cancellationToken)
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

            var digits = PhoneDigits(phone);
            if (digits.Length is < 7 or > 15 || phone.Any(c => !char.IsAsciiDigit(c) && c is not ('+' or ' ' or '-' or '(' or ')' or '.')))
            {
                errors["phone"] = ["Enter a phone number with 7 to 15 digits."];
            }
            else if (!phones.Add(digits))
            {
                errors["phone"] = ["That phone number is already on this child’s emergency contact list."];
            }

            contacts.Add(new(name, relationship, phone, address, contact.CallFirst, contact.Id));
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

            var savedContacts = contacts.OrderByDescending(contact => contact.CallFirst).ToList();
            if (savedContacts.SequenceEqual(current.Contacts))
            {
                return TypedResults.Ok(current);
            }

            var previousById = current.Contacts.Where(contact => contact.Id.HasValue)
                .ToDictionary(contact => contact.Id!.Value);
            var previousByPhone = current.Contacts.ToDictionary(contact => PhoneDigits(contact.Phone), StringComparer.Ordinal);
            var retained = new Dictionary<EmergencyContact, string>();
            var changed = new List<string>();
            var ids = new HashSet<Guid>();
            for (var index = 0; index < savedContacts.Count; index++)
            {
                var contact = savedContacts[index];
                var previous = contact.Id is Guid requestedId
                    ? previousById.GetValueOrDefault(requestedId)
                    : previousByPhone.GetValueOrDefault(PhoneDigits(contact.Phone));
                if (contact.Id.HasValue && previous is null)
                {
                    return TypedResults.BadRequest();
                }

                var id = previous?.Id ?? Guid.NewGuid();
                if (!ids.Add(id) || (previous is not null && !retained.TryAdd(previous, id.ToString())))
                {
                    return TypedResults.BadRequest();
                }

                savedContacts[index] = contact with { Id = id };
                if (previous is null || (previous with { Id = id }) != savedContacts[index])
                {
                    changed.Add(id.ToString());
                }
            }

            if (savedContacts.SequenceEqual(current.Contacts))
            {
                return TypedResults.Ok(current);
            }

            if (row is null)
            {
                row = new EmergencyContacts { FamilyId = tenant.FamilyId, ChildProfileId = childId };
                db.EmergencyContacts.Add(row);
            }

            row.Version++;
            row.ContactsJson = JsonSerializer.Serialize(savedContacts);
            // Convert outstanding positional markers on the first write of a legacy list.
            // Removed contacts no longer have a row to highlight.
            var previousKeys = current.Contacts.Select((contact, index) => (contact, index))
                .ToDictionary(item => item.contact.Id?.ToString() ?? $"contact-{item.index}", item => item.contact);
            var removed = retained.Count != current.Contacts.Count;
            if (removed || current.Contacts.Any(contact => !contact.Id.HasValue))
            {
                var pending = await db.EssentialsUpdates.Where(update =>
                    update.ChildProfileId == childId && update.Section == EssentialsSections.EmergencyContacts &&
                    update.PendingFields.Count > 0).ToListAsync(ct);
                foreach (var update in pending)
                {
                    update.PendingFields = update.PendingFields
                        .Where(key => previousKeys.TryGetValue(key, out var contact) && retained.ContainsKey(contact))
                        .Select(key => retained[previousKeys[key]]).ToList();
                }
            }

            await EssentialsUpdateEndpoints.RecordAsync(db, tenant, childId, EssentialsSections.EmergencyContacts, row.Version,
                removed ? [.. changed, "removed"] : changed, clock.GetUtcNow(), ct, rows: changed);

            await db.SaveChangesAsync(ct);
            return TypedResults.Ok(new EmergencyContactsView(row.Version, savedContacts));
        }, cancellationToken);
    }

    private static string PhoneDigits(string phone) => new(phone.Where(char.IsAsciiDigit).ToArray());

    private static EmergencyContactsView View(EmergencyContacts? row) =>
        row is null ? new(0, []) : new(row.Version, JsonSerializer.Deserialize<EmergencyContact[]>(row.ContactsJson) ?? []);
}
