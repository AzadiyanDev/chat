using TelegramClone.Domain.Entities;

namespace TelegramClone.Domain.Interfaces;

public interface IReactionRepository : IRepository<Reaction>
{
    Task<Reaction?> GetUserReactionAsync(Guid messageId, Guid userId, string emoji);
    Task<IEnumerable<Reaction>> GetMessageReactionsAsync(Guid messageId);
}
