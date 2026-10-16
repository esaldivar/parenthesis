using Microsoft.AspNetCore.Identity;

namespace CoParent.Modules.Identity.Domain;

/// <summary>A person who can sign in: a parent (adult) or, later, a child account without email (A-05).</summary>
internal sealed class AppUser : IdentityUser<Guid>
{
    public const int DisplayNameMaxLength = 80;

    public AppUser()
    {
        Id = Guid.CreateVersion7();
        SecurityStamp = Guid.NewGuid().ToString();
    }

    public required string DisplayName { get; set; }

    public UserType UserType { get; set; } = UserType.Adult;

    public DateTimeOffset CreatedAt { get; set; }
}

internal enum UserType
{
    Adult,
    Child,
}
