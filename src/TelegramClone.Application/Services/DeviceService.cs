using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Application.Services;

public class DeviceService : IDeviceService
{
    private readonly IUnitOfWork _unitOfWork;

    public DeviceService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<DeviceDto> RegisterDeviceAsync(Guid userId, RegisterDeviceDto dto)
    {
        var nextDeviceId = await _unitOfWork.Devices.GetNextDeviceIdAsync(userId);

        var device = new DeviceRegistration
        {
            UserId = userId,
            DeviceId = nextDeviceId,
            DeviceName = dto.DeviceName,
            CreatedAt = DateTime.UtcNow,
            LastActiveAt = DateTime.UtcNow,
            IsActive = true
        };

        await _unitOfWork.Devices.AddAsync(device);
        await _unitOfWork.SaveChangesAsync();

        return MapToDto(device);
    }

    public async Task<IEnumerable<DeviceDto>> GetUserDevicesAsync(Guid userId)
    {
        var devices = await _unitOfWork.Devices.GetUserDevicesAsync(userId);
        return devices.Select(MapToDto);
    }

    public async Task<DeviceDto?> GetDeviceAsync(Guid userId, int deviceId)
    {
        var device = await _unitOfWork.Devices.GetDeviceAsync(userId, deviceId);
        return device != null ? MapToDto(device) : null;
    }

    public async Task RevokeDeviceAsync(Guid userId, int deviceId)
    {
        var device = await _unitOfWork.Devices.GetDeviceAsync(userId, deviceId);
        if (device == null) return;

        device.IsActive = false;
        _unitOfWork.Devices.Update(device);
        await _unitOfWork.SaveChangesAsync();
    }

    public async Task UpdateLastActiveAsync(Guid userId, int deviceId)
    {
        var device = await _unitOfWork.Devices.GetDeviceAsync(userId, deviceId);
        if (device == null) return;

        device.LastActiveAt = DateTime.UtcNow;
        _unitOfWork.Devices.Update(device);
        await _unitOfWork.SaveChangesAsync();
    }

    private static DeviceDto MapToDto(DeviceRegistration d) => new(
        d.Id, d.UserId, d.DeviceId, d.DeviceName,
        d.CreatedAt, d.LastActiveAt, d.IsActive
    );
}
