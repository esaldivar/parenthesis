using CoParent.Modules.Identity.Contracts;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Identity.Infrastructure;

internal sealed class UserDirectory(IdentityModuleDbContext db, ILookupNormalizer normalizer) : IUserDirectory
{
    public async Task<IReadOnlyDictionary<Guid, string>> GetDisplayNamesAsync(
        IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default) =>
        await db.Users
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName, cancellationToken);

    public async Task<DirectoryUser?> FindByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = normalizer.NormalizeEmail(email.Trim());
        return await db.Users
            .Where(u => u.NormalizedEmail == normalized)
            .Select(u => new DirectoryUser(u.Id, u.DisplayName, u.Email!, u.EmailConfirmed))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task<DirectoryUser?> FindByIdAsync(Guid userId, CancellationToken cancellationToken = default) =>
        await db.Users
            .Where(u => u.Id == userId)
            .Select(u => new DirectoryUser(u.Id, u.DisplayName, u.Email!, u.EmailConfirmed))
            .SingleOrDefaultAsync(cancellationToken);
}
