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
        var envelopeList = envelopes.ToList();
        var results = new List<EnvelopeSubmitResultDto>(envelopeList.Count);

        if (envelopeList.Count == 0)
            return results;

        // ── Batch dedup: single query to find all already-existing envelope IDs ──
        var byDevice = envelopeList.GroupBy(e => e.DestinationDeviceId);
        var existingIds = new HashSet<(int deviceId, Guid envelopeId)>();
        foreach (var group in byDevice)
        {
            var deviceExisting = await _unitOfWork.Envelopes.ExistingEnvelopeIdsAsync(
                group.Key, group.Select(e => e.EnvelopeId));
            foreach (var id in deviceExisting)
                existingIds.Add((group.Key, id));
        }

        // ── Batch queue-count: one count per (userId, deviceId) pair ──
        var queueCounts = new Dictionary<(Guid userId, int deviceId), int>();
        var pendingAdds = new List<(SubmitEnvelopeDto dto, MessageEnvelope entity)>();

        foreach (var env in envelopeList)
        {
            // Dedup (already checked in batch)
            if (existingIds.Contains((env.DestinationDeviceId, env.EnvelopeId)))
            {
                results.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "duplicate", "Envelope already exists."));
                continue;
            }

            // Queue limit — fetch count once per device, then track locally
            var key = (env.DestinationUserId, env.DestinationDeviceId);
            if (!queueCounts.TryGetValue(key, out var count))
            {
                count = await _unitOfWork.Envelopes.GetQueuedCountAsync(key.DestinationUserId, key.DestinationDeviceId);
                queueCounts[key] = count;
            }

            if (count >= MaxQueuePerDevice)
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
            queueCounts[key] = count + 1; // Track locally to enforce limit within same batch
            pendingAdds.Add((env, envelope));
        }

        // ── Single SaveChanges for the whole batch ──
        if (pendingAdds.Count > 0)
        {
            try
            {
                await _unitOfWork.SaveChangesAsync();
                foreach (var (dto, _) in pendingAdds)
                    results.Add(new EnvelopeSubmitResultDto(dto.EnvelopeId, "accepted", null));
            }
            catch (Exception ex) when (IsDuplicateKeyException(ex))
            {
                // Fallback: if batch save fails due to a race-condition duplicate,
                // re-process individually so partial success is reported correctly
                return await SubmitEnvelopesIndividuallyAsync(senderUserId, senderDeviceId, pendingAdds.Select(p => p.dto), results);
            }
        }

        return results;
    }

    /// <summary>
    /// Individual fallback: only invoked when a batch save hits a unique-constraint race condition.
    /// This preserves the original per-envelope error reporting.
    /// </summary>
    private async Task<IEnumerable<EnvelopeSubmitResultDto>> SubmitEnvelopesIndividuallyAsync(
        Guid senderUserId, int senderDeviceId,
        IEnumerable<SubmitEnvelopeDto> envelopes,
        List<EnvelopeSubmitResultDto> priorResults)
    {
        foreach (var env in envelopes)
        {
            try
            {
                var alreadyExists = await _unitOfWork.Envelopes.ExistsByEnvelopeIdAsync(
                    env.DestinationDeviceId, env.EnvelopeId);
                if (alreadyExists)
                {
                    priorResults.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "duplicate", "Envelope already exists."));
                    continue;
                }

                var queueCount = await _unitOfWork.Envelopes.GetQueuedCountAsync(
                    env.DestinationUserId, env.DestinationDeviceId);
                if (queueCount >= MaxQueuePerDevice)
                {
                    priorResults.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "rejected",
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
                priorResults.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "accepted", null));
            }
            catch (Exception ex) when (IsDuplicateKeyException(ex))
            {
                priorResults.Add(new EnvelopeSubmitResultDto(env.EnvelopeId, "duplicate", "Envelope already exists."));
            }
        }

        return priorResults;
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
