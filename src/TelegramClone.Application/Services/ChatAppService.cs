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
}
