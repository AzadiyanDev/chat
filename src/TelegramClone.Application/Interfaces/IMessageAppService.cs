using TelegramClone.Application.DTOs;

namespace TelegramClone.Application.Interfaces;

public interface IMessageAppService
{
    Task<IEnumerable<MessageDto>> GetMessagesAsync(Guid chatId, int limit = 50, DateTime? before = null);
    Task<MessageDto> SendMessageAsync(Guid chatId, Guid senderId, SendMessageDto dto);
    Task<bool> DeleteMessageAsync(Guid messageId, Guid userId);
    Task<MessageDto?> AddReactionAsync(Guid messageId, Guid userId, string emoji);
    Task<bool> RemoveReactionAsync(Guid messageId, Guid userId, string emoji);
    Task<MessageDto?> ForwardMessageAsync(Guid messageId, Guid targetChatId, Guid userId);
    Task UpdateMessageStatusAsync(Guid messageId, Domain.Enums.MessageStatus status);
}
