using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Enums;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Application.Services;

public class MessageEnvelopeService : IMessageEnvelopeService
{
    private readonly IUnitOfWork _unitOfWork;
    private const int MaxQueuePerDevice = 1000;

    public MessageEnvelopeService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IEnumerable<EnvelopeSubmitResultDto>> SubmitEnvelopesAsync(
        Guid senderUserId, int senderDeviceId, IEnumerable<SubmitEnvelopeDto> envelopes)
    {
        var results = new List<EnvelopeSubmitResultDto>();

        foreach (var env in envelopes)
        {
            try
            {
                // Explicit dedup check (works with all DB providers, including InMemory)
                var alreadyExists = await _unitOfWork.Envelopes.ExistsByEnvelopeIdAsync(
                    env.DestinationDeviceId, env.EnvelopeId);
                if (alreadyExists)
                {
                    results.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "duplicate", "Envelope already exists."));
                    continue;
                }

                // Queue limit enforcement — reject if device queue is full
                var queueCount = await _unitOfWork.Envelopes.GetQueuedCountAsync(
                    env.DestinationUserId, env.DestinationDeviceId);
                if (queueCount >= MaxQueuePerDevice)
                {
                    results.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "rejected",
                        $"Queue full for device {env.DestinationDeviceId} (max {MaxQueuePerDevice})."));
                    continue;
                }

                var envelope = new MessageEnvelope
                {
                    EnvelopeId = env.EnvelopeId,
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
                await _unitOfWork.SaveChangesAsync();
                results.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "accepted", null));
            }
            catch (Exception ex) when (IsDuplicateKeyException(ex))
            {
                // Safety net: unique constraint violation at DB level (SQL Server / SQLite)
                results.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "duplicate", "Envelope already exists."));
            }
        }

        return results;
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

    /// <summary>
    /// Detect unique constraint violation across SQL Server and other providers.
    /// Belt-and-suspenders safety net; the primary dedup is via ExistsByEnvelopeIdAsync above.
    /// </summary>
    private static bool IsDuplicateKeyException(Exception ex)
    {
        var message = ex.InnerException?.Message ?? ex.Message;
        return message.Contains("2601") || message.Contains("2627")
            || message.Contains("UNIQUE constraint", StringComparison.OrdinalIgnoreCase)
            || message.Contains("duplicate key", StringComparison.OrdinalIgnoreCase);
    }
}
