using Microsoft.EntityFrameworkCore;
using azadiyanChat.Domain.Entities;
using azadiyanChat.Domain.Enums;
using azadiyanChat.Domain.Interfaces;
using azadiyanChat.Infrastructure.Data;

namespace azadiyanChat.Infrastructure.Repositories;

public class ChatRepository : Repository<Chat>, IChatRepository
{
    public ChatRepository(azadiyanChatDbContext context) : base(context) { }

    public async Task<IEnumerable<Chat>> GetUserChatsAsync(Guid userId)
    {
        return await _dbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(c => c.Participants).ThenInclude(p => p.User)
            .Include(c => c.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).Take(1))
                .ThenInclude(m => m.Sender)
            .Include(c => c.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).Take(1))
                .ThenInclude(m => m.TextChunks)
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
            .Include(c => c.Participants).ThenInclude(p => p.User)
            .Include(c => c.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).Take(1))
                .ThenInclude(m => m.Sender)
            .Include(c => c.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).Take(1))
                .ThenInclude(m => m.TextChunks)
            .Where(c => c.Type == ChatType.Direct)
            .Where(c => c.Participants.Any(p => p.UserId == userId1)
                     && c.Participants.Any(p => p.UserId == userId2))
            .FirstOrDefaultAsync();
    }

    public async Task<Chat?> GetSavedMessagesChatAsync(Guid userId)
    {
        return await _dbSet
            .Include(c => c.Participants).ThenInclude(p => p.User)
            .Where(c => c.Type == ChatType.SavedMessages)
            .Where(c => c.Participants.Any(p => p.UserId == userId))
            .FirstOrDefaultAsync();
    }

    public async Task<IEnumerable<Chat>> SearchChatsAsync(Guid userId, string query)
    {
        return await _dbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(c => c.Participants).ThenInclude(p => p.User)
            .Include(c => c.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).Take(1))
                .ThenInclude(m => m.Sender)
            .Include(c => c.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).Take(1))
                .ThenInclude(m => m.TextChunks)
            .Where(c => c.Participants.Any(p => p.UserId == userId))
            .Where(c => (c.Name != null && c.Name.Contains(query))
                     || c.Participants.Any(p => p.User.Name.Contains(query)))
            .ToListAsync();
    }

    public async Task<IEnumerable<Guid>> GetUserChatIdsAsync(Guid userId)
    {
        return await _context.ChatParticipants
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Select(p => p.ChatId)
            .ToListAsync();
    }

    public async Task<bool> IsUserParticipantAsync(Guid chatId, Guid userId)
    {
        return await _context.ChatParticipants
            .AsNoTracking()
            .AnyAsync(p => p.ChatId == chatId && p.UserId == userId);
    }

    public async Task<bool> ShareChatAsync(Guid userId1, Guid userId2)
    {
        return await _context.ChatParticipants
            .AsNoTracking()
            .Where(p => p.UserId == userId1)
            .Select(p => p.ChatId)
            .AnyAsync(chatId => _context.ChatParticipants
                .Any(p2 => p2.ChatId == chatId && p2.UserId == userId2));
    }
}
