using AutoMapper;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Enums;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Application.Services;

public class ChatAppService : IChatAppService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMapper _mapper;

    public ChatAppService(IUnitOfWork unitOfWork, IMapper mapper)
    {
        _unitOfWork = unitOfWork;
        _mapper = mapper;
    }

    public async Task<IEnumerable<ChatListItemDto>> GetUserChatsAsync(Guid userId)
    {
        var chats = (await _unitOfWork.Chats.GetUserChatsAsync(userId)).ToList();
        var unreadByChat = await BuildUnreadMapAsync(chats, userId);

        var mapped = _mapper.Map<List<ChatListItemDto>>(chats);
        for (var i = 0; i < chats.Count; i++)
        {
            if (unreadByChat.TryGetValue(chats[i].Id, out var unread))
            {
                mapped[i].UnreadCount = unread;
            }
        }

        return mapped;
    }

    public async Task<ChatDto?> GetChatByIdAsync(Guid chatId, Guid userId)
    {
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatId);
        if (chat == null) return null;

        // GRP-04: Only participants may access a chat
        if (!chat.Participants.Any(p => p.UserId == userId))
            return null;

        var dto = _mapper.Map<ChatDto>(chat);
        dto.UnreadCount = await GetUnreadCountForChatAsync(chat, userId);
        return dto;
    }

    public async Task<ChatDto> CreateChatAsync(CreateChatDto dto, Guid creatorId)
    {
        // For direct chats, check if one already exists
        if (dto.Type == ChatType.Direct && dto.ParticipantIds.Count == 1)
        {
            var existing = await _unitOfWork.Chats
                .GetDirectChatBetweenUsersAsync(creatorId, dto.ParticipantIds[0]);
            if (existing != null)
            {
                var existingWithParticipants = await _unitOfWork.Chats.GetChatWithParticipantsAsync(existing.Id);
                var existingChat = existingWithParticipants ?? existing;
                var existingDto = _mapper.Map<ChatDto>(existingChat);
                existingDto.UnreadCount = await GetUnreadCountForChatAsync(existingChat, creatorId);
                return existingDto;
            }
        }

        var chat = new Chat
        {
            Type = dto.Type,
            Name = dto.Name,
            Description = dto.Description
        };

        // Add creator as owner
        chat.Participants.Add(new ChatParticipant
        {
            UserId = creatorId,
            Role = "owner"
        });

        // Add other participants
        foreach (var participantId in dto.ParticipantIds.Where(id => id != creatorId).Distinct())
        {
            chat.Participants.Add(new ChatParticipant
            {
                UserId = participantId,
                Role = "member"
            });
        }

        await _unitOfWork.Chats.AddAsync(chat);
        await _unitOfWork.SaveChangesAsync();

        var createdWithParticipants = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chat.Id);
        return _mapper.Map<ChatDto>(createdWithParticipants ?? chat);
    }

    public async Task<bool> PinChatAsync(Guid chatId, Guid userId, bool isPinned)
    {
        var chat = await _unitOfWork.Chats.GetByIdAsync(chatId);
        if (chat == null) return false;

        chat.IsPinned = isPinned;
        _unitOfWork.Chats.Update(chat);
        await _unitOfWork.SaveChangesAsync();
        return true;
    }

    public async Task<bool> MarkChatAsReadAsync(Guid chatId, Guid userId)
    {
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatId);
        if (chat == null) return false;

        var participant = chat.Participants.FirstOrDefault(p => p.UserId == userId);
        if (participant == null) return false;

        participant.LastReadAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync();
        return true;
    }

    public async Task<ChatMembersDto?> GetChatMembersAsync(Guid chatId, Guid userId)
    {
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatId);
        if (chat == null) return null;

        var actorParticipant = chat.Participants.FirstOrDefault(p => p.UserId == userId);
        if (actorParticipant == null) return null;

        if (chat.Type != ChatType.Group)
        {
            return null;
        }

        return new ChatMembersDto
        {
            CanManageMembers = CanManageMembers(actorParticipant),
            Members = chat.Participants
                .Select(MapMember)
                .OrderBy(m => GetRoleSortOrder(m.Role))
                .ThenBy(m => m.Name)
                .ToList()
        };
    }

    public async Task<ChatMemberMutationResultDto> AddChatMemberAsync(Guid chatId, Guid actorUserId, Guid targetUserId)
    {
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatId);
        if (chat == null)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.ChatNotFound };

        var actorParticipant = chat.Participants.FirstOrDefault(p => p.UserId == actorUserId);
        if (actorParticipant == null)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.Forbidden };

        if (chat.Type != ChatType.Group)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.InvalidChatType };

        if (!CanManageMembers(actorParticipant))
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.Forbidden };

        if (chat.Participants.Any(p => p.UserId == targetUserId))
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.AlreadyMember };

        var targetUser = await _unitOfWork.Users.GetByIdAsync(targetUserId);
        if (targetUser == null)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.UserNotFound };

        var participant = new ChatParticipant
        {
            ChatId = chatId,
            UserId = targetUserId,
            User = targetUser,
            Role = "member",
            LastReadAt = DateTime.UtcNow
        };

        chat.Participants.Add(participant);
        await _unitOfWork.SaveChangesAsync();

        return new ChatMemberMutationResultDto
        {
            Status = ChatMemberMutationStatus.Success,
            Member = MapMember(participant)
        };
    }

    public async Task<ChatMemberMutationResultDto> RemoveChatMemberAsync(Guid chatId, Guid actorUserId, Guid targetUserId)
    {
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatId);
        if (chat == null)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.ChatNotFound };

        var actorParticipant = chat.Participants.FirstOrDefault(p => p.UserId == actorUserId);
        if (actorParticipant == null)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.Forbidden };

        if (chat.Type != ChatType.Group)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.InvalidChatType };

        if (!CanManageMembers(actorParticipant))
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.Forbidden };

        var targetParticipant = chat.Participants.FirstOrDefault(p => p.UserId == targetUserId);
        if (targetParticipant == null)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.NotMember };

        if (targetParticipant.UserId == actorUserId)
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.CannotRemoveSelf };

        if (string.Equals(targetParticipant.Role, "owner", StringComparison.OrdinalIgnoreCase))
            return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.CannotRemoveOwner };

        chat.Participants.Remove(targetParticipant);
        await _unitOfWork.SaveChangesAsync();

        return new ChatMemberMutationResultDto { Status = ChatMemberMutationStatus.Success };
    }

    public async Task<IEnumerable<ChatListItemDto>> SearchChatsAsync(Guid userId, string query)
    {
        var chats = (await _unitOfWork.Chats.SearchChatsAsync(userId, query)).ToList();
        var unreadByChat = await BuildUnreadMapAsync(chats, userId);

        var mapped = _mapper.Map<List<ChatListItemDto>>(chats);
        for (var i = 0; i < chats.Count; i++)
        {
            if (unreadByChat.TryGetValue(chats[i].Id, out var unread))
            {
                mapped[i].UnreadCount = unread;
            }
        }

        return mapped;
    }

    public async Task<ChatDto> GetOrCreateSavedMessagesAsync(Guid userId)
    {
        var existing = await _unitOfWork.Chats.GetSavedMessagesChatAsync(userId);
        if (existing != null)
        {
            var existingDto = _mapper.Map<ChatDto>(existing);
            existingDto.UnreadCount = await GetUnreadCountForChatAsync(existing, userId);
            return existingDto;
        }

        var chat = new Chat
        {
            Type = ChatType.SavedMessages,
            Name = "Saved Messages",
            IsPinned = true
        };

        chat.Participants.Add(new ChatParticipant
        {
            UserId = userId,
            Role = "owner"
        });

        await _unitOfWork.Chats.AddAsync(chat);
        await _unitOfWork.SaveChangesAsync();

        // Re-fetch with includes so mapper has the participant User navigation
        var created = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chat.Id);
        var createdDto = _mapper.Map<ChatDto>(created!);
        createdDto.UnreadCount = await GetUnreadCountForChatAsync(created!, userId);
        return createdDto;
    }

    private async Task<Dictionary<Guid, int>> BuildUnreadMapAsync(IReadOnlyList<Chat> chats, Guid userId)
    {
        var tasks = chats.Select(async chat => new
        {
            chat.Id,
            Unread = await GetUnreadCountForChatAsync(chat, userId)
        });

        var results = await Task.WhenAll(tasks);
        return results.ToDictionary(x => x.Id, x => x.Unread);
    }

    private async Task<int> GetUnreadCountForChatAsync(Chat chat, Guid userId)
    {
        var participant = chat.Participants.FirstOrDefault(p => p.UserId == userId);
        if (participant == null) return 0;

        return await _unitOfWork.Messages.GetUnreadCountAsync(chat.Id, userId, participant.LastReadAt);
    }

    private static bool CanManageMembers(ChatParticipant participant)
    {
        return string.Equals(participant.Role, "owner", StringComparison.OrdinalIgnoreCase)
            || string.Equals(participant.Role, "admin", StringComparison.OrdinalIgnoreCase);
    }

    private static int GetRoleSortOrder(string role)
    {
        if (string.Equals(role, "owner", StringComparison.OrdinalIgnoreCase)) return 0;
        if (string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase)) return 1;
        return 2;
    }

    private static ChatMemberDto MapMember(ChatParticipant participant)
    {
        var user = participant.User;
        return new ChatMemberDto
        {
            Id = participant.UserId,
            Name = user?.Name ?? string.Empty,
            Username = user?.Username,
            Bio = user?.Bio,
            AvatarUrl = user?.AvatarUrl,
            IsOnline = user?.IsOnline ?? false,
            LastSeen = user?.LastSeen,
            Role = participant.Role,
            JoinedAt = participant.JoinedAt
        };
    }
}
