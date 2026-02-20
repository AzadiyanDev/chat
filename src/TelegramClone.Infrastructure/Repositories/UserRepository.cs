using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class UserRepository : Repository<User>, IUserRepository
{
    public UserRepository(TelegramDbContext context) : base(context) { }

    public async Task<User?> GetByIdentityIdAsync(string identityUserId)
        => await _dbSet.FirstOrDefaultAsync(u => u.IdentityUserId == identityUserId);

    public async Task<User?> GetByUsernameAsync(string username)
        => await _dbSet.FirstOrDefaultAsync(u => u.Username == username);

    public async Task<IEnumerable<User>> SearchUsersAsync(string query)
        => await _dbSet
            .Where(u => u.Name.Contains(query) || (u.Username != null && u.Username.Contains(query)))
            .Take(20)
            .ToListAsync();

    public async Task UpdateOnlineStatusAsync(Guid userId, bool isOnline)
    {
        var user = await _dbSet.FindAsync(userId);
        if (user != null)
        {
            user.IsOnline = isOnline;
            user.LastSeen = isOnline ? null : DateTime.UtcNow;
        }
    }
}
