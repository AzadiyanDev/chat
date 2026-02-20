using TelegramClone.Domain.Entities;

namespace TelegramClone.Domain.Interfaces;

public interface IMessageRepository : IRepository<Message>
{
    Task<IEnumerable<Message>> GetChatMessagesAsync(Guid chatId, int limit = 50, DateTime? before = null);
    Task<Message?> GetMessageWithDetailsAsync(Guid messageId);
    Task<int> GetUnreadCountAsync(Guid chatId, Guid userId, DateTime lastSeenTimestamp);
}
