using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class MessageRepository : Repository<Message>, IMessageRepository
{
    public MessageRepository(TelegramDbContext context) : base(context) { }

    public async Task<IEnumerable<Message>> GetChatMessagesAsync(Guid chatId, int limit = 50, DateTime? before = null)
    {
        var query = _dbSet
            .AsNoTracking()
            .AsSplitQuery()
            .Include(m => m.Sender)
            .Include(m => m.ReplyTo).ThenInclude(r => r!.Sender)
            .Include(m => m.Attachments)
            .Include(m => m.VoiceNote)
            .Include(m => m.Reactions)
            .Where(m => m.ChatId == chatId && !m.IsDeleted);

        if (before.HasValue)
            query = query.Where(m => m.Timestamp < before.Value);

        return await query
            .OrderByDescending(m => m.Timestamp)
            .ThenByDescending(m => m.Id)
            .Take(limit)
            .OrderBy(m => m.Timestamp)
            .ThenBy(m => m.Id)
            .ToListAsync();
    }

    public async Task<Message?> GetMessageWithDetailsAsync(Guid messageId)
    {
        return await _dbSet
            .AsSplitQuery()
            .Include(m => m.Sender)
            .Include(m => m.ReplyTo).ThenInclude(r => r!.Sender)
            .Include(m => m.Attachments)
            .Include(m => m.VoiceNote)
            .Include(m => m.Reactions)
            .FirstOrDefaultAsync(m => m.Id == messageId);
    }

    public async Task<int> GetUnreadCountAsync(Guid chatId, Guid userId, DateTime lastSeenTimestamp)
    {
        return await _dbSet
            .AsNoTracking()
            .Where(m => m.ChatId == chatId && !m.IsDeleted && m.SenderId != userId && m.Timestamp > lastSeenTimestamp)
            .CountAsync();
    }
}
