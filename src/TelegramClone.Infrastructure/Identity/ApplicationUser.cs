using Microsoft.AspNetCore.Identity;

namespace TelegramClone.Infrastructure.Identity;

public class ApplicationUser : IdentityUser
{
    /// <summary>
    /// Links to the Domain User entity.
    /// </summary>
    public Guid DomainUserId { get; set; }
}
