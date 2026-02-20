using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class MessageEnvelopeRepository : Repository<MessageEnvelope>, IMessageEnvelopeRepository
{
    public MessageEnvelopeRepository(TelegramDbContext context) : base(context) { }

    public async Task<IEnumerable<MessageEnvelope>> GetQueuedEnvelopesAsync(Guid userId, int deviceId, int limit = 100)
    {
        return await _dbSet
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
}
