using azadiyanChat.Domain.Entities;

namespace azadiyanChat.Domain.Interfaces;

public interface IChatRepository : IRepository<Chat>
{
    Task<IEnumerable<Chat>> GetUserChatsAsync(Guid userId);
    Task<Chat?> GetChatWithParticipantsAsync(Guid chatId);
    Task<Chat?> GetDirectChatBetweenUsersAsync(Guid userId1, Guid userId2);
    Task<Chat?> GetSavedMessagesChatAsync(Guid userId);
    Task<IEnumerable<Chat>> SearchChatsAsync(Guid userId, string query);

    /// <summary>Lightweight: returns only chat IDs the user participates in.</summary>
    Task<IEnumerable<Guid>> GetUserChatIdsAsync(Guid userId);

    /// <summary>Lightweight: checks participation without loading the full Chat entity.</summary>
    Task<bool> IsUserParticipantAsync(Guid chatId, Guid userId);

    /// <summary>Checks if two users share at least one chat.</summary>
    Task<bool> ShareChatAsync(Guid userId1, Guid userId2);
}
