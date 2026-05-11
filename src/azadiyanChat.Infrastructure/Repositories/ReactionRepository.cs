using Microsoft.EntityFrameworkCore;
using azadiyanChat.Domain.Entities;
using azadiyanChat.Domain.Interfaces;
using azadiyanChat.Infrastructure.Data;

namespace azadiyanChat.Infrastructure.Repositories;

public class ReactionRepository : Repository<Reaction>, IReactionRepository
{
    public ReactionRepository(azadiyanChatDbContext context) : base(context) { }

    public async Task<Reaction?> GetUserReactionAsync(Guid messageId, Guid userId, string emoji)
    {
        return await _dbSet.FirstOrDefaultAsync(r =>
            r.MessageId == messageId && r.UserId == userId && r.Emoji == emoji);
    }

    public async Task<IEnumerable<Reaction>> GetMessageReactionsAsync(Guid messageId)
    {
        return await _dbSet
            .AsNoTracking()
            .Where(r => r.MessageId == messageId)
            .ToListAsync();
    }
}
