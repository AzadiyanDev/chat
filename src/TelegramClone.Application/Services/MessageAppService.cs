using AutoMapper;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Enums;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Application.Services;

public class MessageAppService : IMessageAppService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMapper _mapper;

    public MessageAppService(IUnitOfWork unitOfWork, IMapper mapper)
    {
        _unitOfWork = unitOfWork;
        _mapper = mapper;
    }

    public async Task<IEnumerable<MessageDto>> GetMessagesAsync(Guid chatId, int limit = 50, DateTime? before = null)
    {
        var messages = await _unitOfWork.Messages.GetChatMessagesAsync(chatId, limit, before);
        return _mapper.Map<IEnumerable<MessageDto>>(messages);
    }

    public async Task<MessageDto> SendMessageAsync(Guid chatId, Guid senderId, SendMessageDto dto)
    {
        var attachments = (dto.Attachments ?? new List<SendAttachmentDto>())
            .Where(a => !string.IsNullOrWhiteSpace(a.Url))
            .Select(a => new Attachment
            {
                Type = a.Type,
                Url = a.Url.Trim(),
                Name = string.IsNullOrWhiteSpace(a.Name) ? null : a.Name.Trim(),
                Size = a.Size,
                ThumbnailUrl = string.IsNullOrWhiteSpace(a.ThumbnailUrl) ? null : a.ThumbnailUrl.Trim()
            })
            .ToList();

        var message = new Message
        {
            ChatId = chatId,
            SenderId = senderId,
            Text = string.IsNullOrWhiteSpace(dto.Text) ? null : dto.Text.Trim(),
            ReplyToId = dto.ReplyToId,
            Status = MessageStatus.Sent,
            Timestamp = DateTime.UtcNow,
            Attachments = attachments
        };

        await _unitOfWork.Messages.AddAsync(message);
        await _unitOfWork.SaveChangesAsync();

        // Reload with details (sender, replyTo)
        var saved = await _unitOfWork.Messages.GetMessageWithDetailsAsync(message.Id);
        return _mapper.Map<MessageDto>(saved!);
    }

    public async Task<bool> DeleteMessageAsync(Guid messageId, Guid userId)
    {
        var message = await _unitOfWork.Messages.GetByIdAsync(messageId);
        if (message == null || message.SenderId != userId) return false;

        message.IsDeleted = true;
        _unitOfWork.Messages.Update(message);
        await _unitOfWork.SaveChangesAsync();
        return true;
    }

    public async Task<MessageDto?> AddReactionAsync(Guid messageId, Guid userId, string emoji)
    {
        // Check if reaction already exists
        var existing = await _unitOfWork.Reactions.GetUserReactionAsync(messageId, userId, emoji);
        if (existing != null)
        {
            // Toggle off
            _unitOfWork.Reactions.Remove(existing);
        }
        else
        {
            var reaction = new Reaction
            {
                MessageId = messageId,
                UserId = userId,
                Emoji = emoji
            };
            await _unitOfWork.Reactions.AddAsync(reaction);
        }

        await _unitOfWork.SaveChangesAsync();

        var message = await _unitOfWork.Messages.GetMessageWithDetailsAsync(messageId);
        return _mapper.Map<MessageDto>(message);
    }

    public async Task<bool> RemoveReactionAsync(Guid messageId, Guid userId, string emoji)
    {
        var reaction = await _unitOfWork.Reactions.GetUserReactionAsync(messageId, userId, emoji);
        if (reaction == null) return false;

        _unitOfWork.Reactions.Remove(reaction);
        await _unitOfWork.SaveChangesAsync();
        return true;
    }

    public async Task<MessageDto?> ForwardMessageAsync(Guid messageId, Guid targetChatId, Guid userId)
    {
        var original = await _unitOfWork.Messages.GetMessageWithDetailsAsync(messageId);
        if (original == null) return null;

        var forwarded = new Message
        {
            ChatId = targetChatId,
            SenderId = userId,
            Text = $"Forwarded: {original.Text}",
            Status = MessageStatus.Sent,
            Timestamp = DateTime.UtcNow
        };

        await _unitOfWork.Messages.AddAsync(forwarded);
        await _unitOfWork.SaveChangesAsync();

        var saved = await _unitOfWork.Messages.GetMessageWithDetailsAsync(forwarded.Id);
        return _mapper.Map<MessageDto>(saved);
    }

    public async Task UpdateMessageStatusAsync(Guid messageId, MessageStatus status)
    {
        var message = await _unitOfWork.Messages.GetByIdAsync(messageId);
        if (message == null) return;

        message.Status = status;
        _unitOfWork.Messages.Update(message);
        await _unitOfWork.SaveChangesAsync();
    }
}
