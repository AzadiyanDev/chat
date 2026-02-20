using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Enums;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class ChatRepository : Repository<Chat>, IChatRepository
{
    public ChatRepository(TelegramDbContext context) : base(context) { }

    public async Task<IEnumerable<Chat>> GetUserChatsAsync(Guid userId)
    {
        return await _dbSet
            .Include(c => c.Participants).ThenInclude(p => p.User)
            .Include(c => c.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).Take(1))
                .ThenInclude(m => m.Sender)
            .Where(c => c.Participants.Any(p => p.UserId == userId))
            .OrderByDescending(c => c.Messages.Where(m => !m.IsDeleted).Max(m => (DateTime?)m.Timestamp) ?? c.CreatedAt)
            .ToListAsync();
    }

    public async Task<Chat?> GetChatWithParticipantsAsync(Guid chatId)
    {
        return await _dbSet
            .Include(c => c.Participants).ThenInclude(p => p.User)
            .FirstOrDefaultAsync(c => c.Id == chatId);
    }

    public async Task<Chat?> GetDirectChatBetweenUsersAsync(Guid userId1, Guid userId2)
    {
        return await _dbSet
            .Include(c => c.Participants)
            .Where(c => c.Type == ChatType.Direct)
            .Where(c => c.Participants.Any(p => p.UserId == userId1)
                     && c.Participants.Any(p => p.UserId == userId2))
            .FirstOrDefaultAsync();
    }

    public async Task<IEnumerable<Chat>> SearchChatsAsync(Guid userId, string query)
    {
        return await _dbSet
            .Include(c => c.Participants).ThenInclude(p => p.User)
            .Include(c => c.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).Take(1))
                .ThenInclude(m => m.Sender)
            .Where(c => c.Participants.Any(p => p.UserId == userId))
            .Where(c => (c.Name != null && c.Name.Contains(query))
                     || c.Participants.Any(p => p.User.Name.Contains(query)))
            .ToListAsync();
    }
}
