using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class DeviceRepository : Repository<DeviceRegistration>, IDeviceRepository
{
    public DeviceRepository(TelegramDbContext context) : base(context) { }

    public async Task<IEnumerable<DeviceRegistration>> GetUserDevicesAsync(Guid userId)
    {
        return await _dbSet
            .Where(d => d.UserId == userId && d.IsActive)
            .OrderBy(d => d.DeviceId)
            .ToListAsync();
    }

    public async Task<DeviceRegistration?> GetDeviceAsync(Guid userId, int deviceId)
    {
        return await _dbSet
            .FirstOrDefaultAsync(d => d.UserId == userId && d.DeviceId == deviceId && d.IsActive);
    }

    public async Task<int> GetNextDeviceIdAsync(Guid userId)
    {
        var maxDeviceId = await _dbSet
            .Where(d => d.UserId == userId)
            .MaxAsync(d => (int?)d.DeviceId) ?? 0;
        return maxDeviceId + 1;
    }
}
