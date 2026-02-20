using TelegramClone.Domain.Entities;

namespace TelegramClone.Domain.Interfaces;

public interface IChatRepository : IRepository<Chat>
{
    Task<IEnumerable<Chat>> GetUserChatsAsync(Guid userId);
    Task<Chat?> GetChatWithParticipantsAsync(Guid chatId);
    Task<Chat?> GetDirectChatBetweenUsersAsync(Guid userId1, Guid userId2);
    Task<Chat?> GetSavedMessagesChatAsync(Guid userId);
    Task<IEnumerable<Chat>> SearchChatsAsync(Guid userId, string query);
}
