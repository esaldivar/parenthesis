using CoParent.Modules.Identity.Contracts;
using Microsoft.EntityFrameworkCore;

namespace CoParent.Modules.Identity.Infrastructure;

internal sealed class UserDirectory(IdentityModuleDbContext db) : IUserDirectory
{
    public async Task<IReadOnlyDictionary<Guid, string>> GetDisplayNamesAsync(
        IReadOnlyCollection<Guid> userIds, CancellationToken cancellationToken = default) =>
        await db.Users
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName, cancellationToken);
}
