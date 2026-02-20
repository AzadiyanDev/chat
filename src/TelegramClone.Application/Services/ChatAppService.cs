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
        var chats = await _unitOfWork.Chats.GetUserChatsAsync(userId);
        return _mapper.Map<IEnumerable<ChatListItemDto>>(chats);
    }

    public async Task<ChatDto?> GetChatByIdAsync(Guid chatId, Guid userId)
    {
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatId);
        if (chat == null) return null;

        var dto = _mapper.Map<ChatDto>(chat);
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
                return _mapper.Map<ChatDto>(existing);
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
        foreach (var participantId in dto.ParticipantIds)
        {
            chat.Participants.Add(new ChatParticipant
            {
                UserId = participantId,
                Role = "member"
            });
        }

        await _unitOfWork.Chats.AddAsync(chat);
        await _unitOfWork.SaveChangesAsync();

        return _mapper.Map<ChatDto>(chat);
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

    public async Task<IEnumerable<ChatListItemDto>> SearchChatsAsync(Guid userId, string query)
    {
        var chats = await _unitOfWork.Chats.SearchChatsAsync(userId, query);
        return _mapper.Map<IEnumerable<ChatListItemDto>>(chats);
    }
}
