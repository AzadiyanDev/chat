using TelegramClone.Domain.Entities;

namespace TelegramClone.Domain.Interfaces;

public interface IUserRepository : IRepository<User>
{
    Task<User?> GetByIdentityIdAsync(string identityUserId);
    Task<User?> GetByUsernameAsync(string username);
    Task<IEnumerable<User>> SearchUsersAsync(string query);
    Task UpdateOnlineStatusAsync(Guid userId, bool isOnline);
}
