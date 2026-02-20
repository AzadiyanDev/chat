using TelegramClone.Domain.Entities;

namespace TelegramClone.Domain.Interfaces;

public interface IMessageEnvelopeRepository : IRepository<MessageEnvelope>
{
    /// <summary>
    /// Get all undelivered envelopes for a specific user device.
    /// </summary>
    Task<IEnumerable<MessageEnvelope>> GetQueuedEnvelopesAsync(Guid userId, int deviceId, int limit = 100);

    /// <summary>
    /// Mark envelopes as delivered (so they can be cleaned up).
    /// </summary>
    Task MarkDeliveredAsync(IEnumerable<Guid> envelopeIds);

    /// <summary>
    /// Delete delivered envelopes that have been acknowledged.
    /// </summary>
    Task DeleteDeliveredAsync(IEnumerable<Guid> envelopeIds);

    /// <summary>
    /// Clean up expired envelopes.
    /// </summary>
    Task DeleteExpiredAsync();
}
