using TelegramClone.Application.DTOs;

namespace TelegramClone.Application.Interfaces;

/// <summary>
/// Manages device registrations for multi-device E2EE.
/// Each user can have multiple devices, each with its own identity key.
/// </summary>
public interface IDeviceService
{
    Task<DeviceDto> RegisterDeviceAsync(Guid userId, RegisterDeviceDto dto);
    Task<IEnumerable<DeviceDto>> GetUserDevicesAsync(Guid userId);
    Task<DeviceDto?> GetDeviceAsync(Guid userId, int deviceId);
    Task RevokeDeviceAsync(Guid userId, int deviceId);
    Task UpdateLastActiveAsync(Guid userId, int deviceId);
}
