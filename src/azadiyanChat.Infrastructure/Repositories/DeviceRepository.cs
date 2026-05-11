using Microsoft.EntityFrameworkCore;
using azadiyanChat.Domain.Entities;
using azadiyanChat.Domain.Interfaces;
using azadiyanChat.Infrastructure.Data;

namespace azadiyanChat.Infrastructure.Repositories;

public class DeviceRepository : Repository<DeviceRegistration>, IDeviceRepository
{
    public DeviceRepository(azadiyanChatDbContext context) : base(context) { }

    public async Task<IEnumerable<DeviceRegistration>> GetUserDevicesAsync(Guid userId)
    {
        return await _dbSet
            .AsNoTracking()
            .Where(d => d.UserId == userId && d.IsActive)
            .OrderBy(d => d.DeviceId)
            .ToListAsync();
    }

    public async Task<DeviceRegistration?> GetDeviceAsync(Guid userId, int deviceId)
    {
        return await _dbSet
            .AsNoTracking()
            .FirstOrDefaultAsync(d => d.UserId == userId && d.DeviceId == deviceId && d.IsActive);
    }

    public async Task<int> GetNextDeviceIdAsync(Guid userId)
    {
        var maxDeviceId = await _dbSet
            .AsNoTracking()
            .Where(d => d.UserId == userId)
            .MaxAsync(d => (int?)d.DeviceId) ?? 0;
        return maxDeviceId + 1;
    }
}
