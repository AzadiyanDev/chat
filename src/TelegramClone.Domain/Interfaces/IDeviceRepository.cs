using TelegramClone.Domain.Entities;

namespace TelegramClone.Domain.Interfaces;

public interface IDeviceRepository : IRepository<DeviceRegistration>
{
    Task<IEnumerable<DeviceRegistration>> GetUserDevicesAsync(Guid userId);
    Task<DeviceRegistration?> GetDeviceAsync(Guid userId, int deviceId);
    Task<int> GetNextDeviceIdAsync(Guid userId);
}
