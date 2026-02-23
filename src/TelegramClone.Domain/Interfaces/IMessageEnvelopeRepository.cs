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

    /// <summary>
    /// Count undelivered envelopes for a specific device (for queue limit enforcement).
    /// </summary>
    Task<int> GetQueuedCountAsync(Guid userId, int deviceId);

    /// <summary>
    /// Check if an envelope with the given dedup ID already exists for a device.
    /// </summary>
    Task<bool> ExistsByEnvelopeIdAsync(int destinationDeviceId, Guid envelopeId);

    /// <summary>
    /// Batch dedup check: returns the set of envelopeIds that already exist for a given device.
    /// </summary>
    Task<HashSet<Guid>> ExistingEnvelopeIdsAsync(int destinationDeviceId, IEnumerable<Guid> envelopeIds);
}
