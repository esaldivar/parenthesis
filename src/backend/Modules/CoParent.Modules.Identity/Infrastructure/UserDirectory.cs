using CoParent.Modules.Identity.Contracts;
using CoParent.Modules.Identity.Endpoints;
using CoParent.Modules.Identity.Infrastructure.Persistence;
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

    private IQueryable<DirectoryUser> WithLanguage(IQueryable<Domain.AppUser> users) =>
        users.Select(u => new DirectoryUser(u.Id, u.DisplayName, u.Email!, u.EmailConfirmed,
            db.Set<IdentityUserToken<Guid>>().Any(token => token.UserId == u.Id
                && token.LoginProvider == UserLanguage.Provider && token.Name == UserLanguage.TokenName
                && token.Value == UserLanguage.Spanish)));

    public async Task<DirectoryUser?> FindByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = normalizer.NormalizeEmail(email.Trim());
        return await WithLanguage(db.Users.Where(u => u.NormalizedEmail == normalized))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task<DirectoryUser?> FindByIdAsync(Guid userId, CancellationToken cancellationToken = default) =>
        await WithLanguage(db.Users.Where(u => u.Id == userId))
            .SingleOrDefaultAsync(cancellationToken);
}
