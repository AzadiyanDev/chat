using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Web.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DevicesController : ControllerBase
{
    private readonly IDeviceService _deviceService;
    private readonly IUnitOfWork _unitOfWork;

    public DevicesController(IDeviceService deviceService, IUnitOfWork unitOfWork)
    {
        _deviceService = deviceService;
        _unitOfWork = unitOfWork;
    }

    private async Task<Guid?> GetCurrentDomainUserIdAsync()
    {
        var identityId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityId)) return null;
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityId);
        return user?.Id;
    }

    /// <summary>
    /// Register a new device for the current user.
    /// Each device gets its own identity key and Signal Protocol sessions.
    /// </summary>
    [HttpPost("register")]
    public async Task<IActionResult> RegisterDevice([FromBody] RegisterDeviceDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var device = await _deviceService.RegisterDeviceAsync(userId.Value, dto);
        return Ok(device);
    }

    /// <summary>
    /// List all active devices for the current user.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetDevices()
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var devices = await _deviceService.GetUserDevicesAsync(userId.Value);
        return Ok(devices);
    }

    /// <summary>
    /// Revoke a device (deactivate its keys and sessions).
    /// </summary>
    [HttpDelete("{deviceId:int}")]
    public async Task<IActionResult> RevokeDevice(int deviceId)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        await _deviceService.RevokeDeviceAsync(userId.Value, deviceId);
        return NoContent();
    }
}
