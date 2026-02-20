using TelegramClone.Application.DTOs;

namespace TelegramClone.Application.Interfaces;

public interface IChatAppService
{
    Task<IEnumerable<ChatListItemDto>> GetUserChatsAsync(Guid userId);
    Task<ChatDto?> GetChatByIdAsync(Guid chatId, Guid userId);
    Task<ChatDto> CreateChatAsync(CreateChatDto dto, Guid creatorId);
    Task<bool> PinChatAsync(Guid chatId, Guid userId, bool isPinned);
    Task<IEnumerable<ChatListItemDto>> SearchChatsAsync(Guid userId, string query);
}
