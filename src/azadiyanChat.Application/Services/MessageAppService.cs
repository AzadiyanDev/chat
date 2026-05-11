using AutoMapper;
using System.Security.Cryptography;
using azadiyanChat.Application.DTOs;
using azadiyanChat.Application.Interfaces;
using azadiyanChat.Domain.Entities;
using azadiyanChat.Domain.Enums;
using azadiyanChat.Domain.Interfaces;

namespace azadiyanChat.Application.Services;

public class MessageAppService : IMessageAppService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMapper _mapper;
    private readonly IMessageTextProtectionService _messageTextProtection;

    public MessageAppService(
        IUnitOfWork unitOfWork,
        IMapper mapper,
        IMessageTextProtectionService messageTextProtection)
    {
        _unitOfWork = unitOfWork;
        _mapper = mapper;
        _messageTextProtection = messageTextProtection;
    }

    public async Task<IEnumerable<MessageDto>> GetMessagesAsync(Guid chatId, int limit = 50, DateTime? before = null)
    {
        var messages = await _unitOfWork.Messages.GetChatMessagesAsync(chatId, limit, before);
        foreach (var message in messages)
        {
            ApplyDecryptedText(message);
        }

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

        var normalizedText = NormalizeText(dto.Text);
        var message = new Message
        {
            ChatId = chatId,
            SenderId = senderId,
            Text = null,
            ReplyToId = dto.ReplyToId,
            Status = MessageStatus.Sent,
            Timestamp = DateTime.UtcNow,
            Attachments = attachments
        };
        SetEncryptedText(message, normalizedText);

        // Handle voice note if provided
        if (dto.Voice != null && !string.IsNullOrWhiteSpace(dto.Voice.Url))
        {
            // Security: only allow URLs under /uploads/voices/
            var voiceUrl = dto.Voice.Url.Trim();
            if (!voiceUrl.StartsWith("/uploads/voices/", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("Invalid voice URL.");

            var voiceNote = new VoiceNote
            {
                Url = voiceUrl,
                Duration = dto.Voice.Duration,
                DurationMs = dto.Voice.DurationMs
            };
            voiceNote.SetWaveform(dto.Voice.Waveform ?? Array.Empty<double>());
            message.VoiceNote = voiceNote;
        }

        await _unitOfWork.Messages.AddAsync(message);
        await _unitOfWork.SaveChangesAsync();

        // Reload with details (sender, replyTo)
        var saved = await _unitOfWork.Messages.GetMessageWithDetailsAsync(message.Id);
        ApplyDecryptedText(saved);
        return _mapper.Map<MessageDto>(saved!);
    }

    public async Task<MessageDto?> EditMessageAsync(Guid chatId, Guid messageId, Guid userId, EditMessageDto dto)
    {
        var message = await _unitOfWork.Messages.GetMessageWithDetailsAsync(messageId);
        if (message == null || message.ChatId != chatId || message.SenderId != userId || message.IsDeleted) return null;

        var updatedText = (dto.Text ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(updatedText))
            throw new ArgumentException("Message text cannot be empty.");

        message.Text = null;
        message.TextChunks.Clear();
        SetEncryptedText(message, updatedText);
        _unitOfWork.Messages.Update(message);
        await _unitOfWork.SaveChangesAsync();

        var updated = await _unitOfWork.Messages.GetMessageWithDetailsAsync(message.Id);
        ApplyDecryptedText(updated);
        return updated == null ? null : _mapper.Map<MessageDto>(updated);
    }

    public async Task<bool> DeleteMessageAsync(Guid chatId, Guid messageId, Guid userId)
    {
        var message = await _unitOfWork.Messages.GetByIdAsync(messageId);
        if (message == null || message.ChatId != chatId || message.SenderId != userId || message.IsDeleted) return false;

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
        ApplyDecryptedText(message);
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
        ApplyDecryptedText(original);
        var forwardedText = string.IsNullOrWhiteSpace(original.Text)
            ? "Forwarded message"
            : $"Forwarded: {original.Text}";

        var forwarded = new Message
        {
            ChatId = targetChatId,
            SenderId = userId,
            Text = null,
            Status = MessageStatus.Sent,
            Timestamp = DateTime.UtcNow
        };
        SetEncryptedText(forwarded, forwardedText);

        await _unitOfWork.Messages.AddAsync(forwarded);
        await _unitOfWork.SaveChangesAsync();

        var saved = await _unitOfWork.Messages.GetMessageWithDetailsAsync(forwarded.Id);
        ApplyDecryptedText(saved);
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

    private static string? NormalizeText(string? text)
    {
        return string.IsNullOrWhiteSpace(text) ? null : text.Trim();
    }

    private void SetEncryptedText(Message message, string? plaintext)
    {
        if (string.IsNullOrWhiteSpace(plaintext))
            return;

        var encryptedChunks = _messageTextProtection.Encrypt(message.ChatId, message.Id, plaintext);
        foreach (var chunk in encryptedChunks)
        {
            message.TextChunks.Add(new MessageTextChunk
            {
                ChunkIndex = chunk.ChunkIndex,
                Payload = chunk.Payload
            });
        }
    }

    private void ApplyDecryptedText(Message? message)
    {
        if (message == null)
            return;

        try
        {
            message.Text = _messageTextProtection.Decrypt(
                message.ChatId,
                message.Id,
                message.TextChunks.Select(c => new MessageTextEncryptedChunk(c.ChunkIndex, c.Payload)),
                message.Text);
        }
        catch (CryptographicException)
        {
            // Keep API resilient when historical ciphertext cannot be decrypted with current key material.
        }
        catch (InvalidOperationException)
        {
        }

        if (message.ReplyTo != null)
        {
            try
            {
                message.ReplyTo.Text = _messageTextProtection.Decrypt(
                    message.ReplyTo.ChatId,
                    message.ReplyTo.Id,
                    message.ReplyTo.TextChunks.Select(c => new MessageTextEncryptedChunk(c.ChunkIndex, c.Payload)),
                    message.ReplyTo.Text);
            }
            catch (CryptographicException)
            {
            }
            catch (InvalidOperationException)
            {
            }
        }
    }
}
