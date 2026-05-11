using azadiyanChat.Application.DTOs;

namespace azadiyanChat.Application.Interfaces;

public interface IChatAppService
{
    Task<IEnumerable<ChatListItemDto>> GetUserChatsAsync(Guid userId);
    Task<ChatDto?> GetChatByIdAsync(Guid chatId, Guid userId);
    Task<ChatDto> CreateChatAsync(CreateChatDto dto, Guid creatorId);
    Task<bool> PinChatAsync(Guid chatId, Guid userId, bool isPinned);
    Task<bool> MarkChatAsReadAsync(Guid chatId, Guid userId);
    Task<ChatMembersDto?> GetChatMembersAsync(Guid chatId, Guid userId);
    Task<ChatMemberMutationResultDto> AddChatMemberAsync(Guid chatId, Guid actorUserId, Guid targetUserId);
    Task<ChatMemberMutationResultDto> RemoveChatMemberAsync(Guid chatId, Guid actorUserId, Guid targetUserId);
    Task<IEnumerable<ChatListItemDto>> SearchChatsAsync(Guid userId, string query);
    Task<ChatDto> GetOrCreateSavedMessagesAsync(Guid userId);
}
