using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class ReactionRepository : Repository<Reaction>, IReactionRepository
{
    public ReactionRepository(TelegramDbContext context) : base(context) { }

    public async Task<Reaction?> GetUserReactionAsync(Guid messageId, Guid userId, string emoji)
    {
        return await _dbSet.FirstOrDefaultAsync(r =>
            r.MessageId == messageId && r.UserId == userId && r.Emoji == emoji);
    }

    public async Task<IEnumerable<Reaction>> GetMessageReactionsAsync(Guid messageId)
    {
        return await _dbSet
            .Where(r => r.MessageId == messageId)
            .ToListAsync();
    }
}
