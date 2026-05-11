using Microsoft.EntityFrameworkCore;
using azadiyanChat.Domain.Entities;
using azadiyanChat.Domain.Interfaces;
using azadiyanChat.Infrastructure.Data;

namespace azadiyanChat.Infrastructure.Repositories;

public class MessageEnvelopeRepository : Repository<MessageEnvelope>, IMessageEnvelopeRepository
{
    public MessageEnvelopeRepository(azadiyanChatDbContext context) : base(context) { }

    public async Task<IEnumerable<MessageEnvelope>> GetQueuedEnvelopesAsync(Guid userId, int deviceId, int limit = 100)
    {
        return await _dbSet
            .AsNoTracking()
            .Where(e => e.DestinationUserId == userId
                     && e.DestinationDeviceId == deviceId
                     && !e.IsDelivered
                     && e.ExpiresAt > DateTime.UtcNow)
            .OrderBy(e => e.ServerTimestamp)
            .Take(limit)
            .ToListAsync();
    }

    public async Task MarkDeliveredAsync(IEnumerable<Guid> envelopeIds)
    {
        var idList = envelopeIds.ToList();
        await _dbSet
            .Where(e => idList.Contains(e.Id))
            .ExecuteUpdateAsync(s => s.SetProperty(e => e.IsDelivered, true));
    }

    public async Task DeleteDeliveredAsync(IEnumerable<Guid> envelopeIds)
    {
        var idList = envelopeIds.ToList();
        await _dbSet
            .Where(e => idList.Contains(e.Id) && e.IsDelivered)
            .ExecuteDeleteAsync();
    }

    public async Task DeleteExpiredAsync()
    {
        await _dbSet
            .Where(e => e.ExpiresAt <= DateTime.UtcNow)
            .ExecuteDeleteAsync();
    }

    public async Task<int> GetQueuedCountAsync(Guid userId, int deviceId)
    {
        return await _dbSet
            .AsNoTracking()
            .CountAsync(e => e.DestinationUserId == userId
                         && e.DestinationDeviceId == deviceId
                         && !e.IsDelivered);
    }

    public async Task<bool> ExistsByEnvelopeIdAsync(int destinationDeviceId, Guid envelopeId)
    {
        return await _dbSet
            .AsNoTracking()
            .AnyAsync(e => e.DestinationDeviceId == destinationDeviceId && e.EnvelopeId == envelopeId);
    }

    /// <summary>Batch dedup check: returns the set of envelopeIds that already exist for a given device.</summary>
    public async Task<HashSet<Guid>> ExistingEnvelopeIdsAsync(int destinationDeviceId, IEnumerable<Guid> envelopeIds)
    {
        var idList = envelopeIds.ToList();
        var existing = await _dbSet
            .AsNoTracking()
            .Where(e => e.DestinationDeviceId == destinationDeviceId && idList.Contains(e.EnvelopeId))
            .Select(e => e.EnvelopeId)
            .ToListAsync();
        return new HashSet<Guid>(existing);
    }
}
