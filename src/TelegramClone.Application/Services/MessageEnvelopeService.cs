using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Enums;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Application.Services;

public class MessageEnvelopeService : IMessageEnvelopeService
{
    private readonly IUnitOfWork _unitOfWork;

    public MessageEnvelopeService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task SubmitEnvelopesAsync(Guid senderUserId, int senderDeviceId, IEnumerable<SubmitEnvelopeDto> envelopes)
    {
        foreach (var env in envelopes)
        {
            var envelope = new MessageEnvelope
            {
                DestinationUserId = env.DestinationUserId,
                DestinationDeviceId = env.DestinationDeviceId,
                Type = (EnvelopeType)env.Type,
                Content = Convert.FromBase64String(env.Content),
                ServerTimestamp = DateTime.UtcNow,
                IsDelivered = false,
                ExpiresAt = DateTime.UtcNow.AddDays(30),
                SourceUserId = senderUserId,
                SourceDeviceId = senderDeviceId
            };

            await _unitOfWork.Envelopes.AddAsync(envelope);
        }

        await _unitOfWork.SaveChangesAsync();
    }

    public async Task<IEnumerable<EnvelopeResponseDto>> FetchQueuedAsync(Guid userId, int deviceId, int limit = 100)
    {
        var envelopes = await _unitOfWork.Envelopes.GetQueuedEnvelopesAsync(userId, deviceId, limit);

        return envelopes.Select(e => new EnvelopeResponseDto(
            e.Id,
            e.SourceUserId,
            e.SourceDeviceId,
            (int)e.Type,
            Convert.ToBase64String(e.Content),
            e.ServerTimestamp
        ));
    }

    public async Task AcknowledgeAsync(Guid userId, int deviceId, AcknowledgeEnvelopesDto dto)
    {
        // Mark as delivered first, then delete
        await _unitOfWork.Envelopes.MarkDeliveredAsync(dto.EnvelopeIds);
        await _unitOfWork.Envelopes.DeleteDeliveredAsync(dto.EnvelopeIds);
        await _unitOfWork.SaveChangesAsync();
    }
}
