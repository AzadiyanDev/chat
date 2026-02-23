using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class UserRepository : Repository<User>, IUserRepository
{
    public UserRepository(TelegramDbContext context) : base(context) { }

    public async Task<User?> GetByIdentityIdAsync(string identityUserId)
        => await _dbSet.AsNoTracking().FirstOrDefaultAsync(u => u.IdentityUserId == identityUserId);

    public async Task<User?> GetByUsernameAsync(string username)
        => await _dbSet.AsNoTracking().FirstOrDefaultAsync(u => u.Username == username);

    public async Task<IEnumerable<User>> SearchUsersAsync(string query)
        => await _dbSet
            .AsNoTracking()
            .Where(u => u.Name.Contains(query) || (u.Username != null && u.Username.Contains(query)))
            .OrderBy(u => u.Name).ThenBy(u => u.Id)
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
