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
public class KeysController : ControllerBase
{
    private readonly IKeyBundleService _keyBundleService;
    private readonly IUnitOfWork _unitOfWork;

    public KeysController(IKeyBundleService keyBundleService, IUnitOfWork unitOfWork)
    {
        _keyBundleService = keyBundleService;
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
    /// Upload a full key bundle for the current user's device.
    /// Contains: identity public key, signed pre-key, optional kyber pre-key, one-time pre-keys.
    /// Private keys NEVER leave the client device.
    /// </summary>
    [HttpPost("bundle/{deviceId:int}")]
    public async Task<IActionResult> UploadBundle(int deviceId, [FromBody] UploadKeyBundleDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        await _keyBundleService.UploadBundleAsync(userId.Value, deviceId, dto);

        // Return remaining OTPK count so client knows if replenishment is needed
        var count = await _keyBundleService.GetOneTimePreKeyCountAsync(userId.Value, deviceId);
        return Ok(new { uploaded = true, remainingOneTimePreKeys = count });
    }

    /// <summary>
    /// Fetch a key bundle for a target user's specific device.
    /// Consumes one one-time pre-key (for session establishment).
    /// </summary>
    [HttpGet("bundle/{userId:guid}/{deviceId:int}")]
    public async Task<IActionResult> FetchBundle(Guid userId, int deviceId)
    {
        var bundle = await _keyBundleService.FetchBundleAsync(userId, deviceId);
        if (bundle == null) return NotFound(new { error = "Key bundle not found for this device." });
        return Ok(bundle);
    }

    /// <summary>
    /// Fetch key bundles for ALL active devices of a target user.
    /// Used to send a message to all of a user's devices simultaneously.
    /// </summary>
    [HttpGet("bundle/{userId:guid}")]
    public async Task<IActionResult> FetchAllBundles(Guid userId)
    {
        var bundles = await _keyBundleService.FetchAllDeviceBundlesAsync(userId);
        return Ok(bundles);
    }

    /// <summary>
    /// Upload additional one-time pre-keys (replenishment).
    /// Client should call this when OTPK count drops below threshold (e.g., 20).
    /// </summary>
    [HttpPost("replenish/{deviceId:int}")]
    public async Task<IActionResult> ReplenishPreKeys(int deviceId, [FromBody] ReplenishPreKeysDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        await _keyBundleService.ReplenishPreKeysAsync(userId.Value, deviceId, dto);

        var count = await _keyBundleService.GetOneTimePreKeyCountAsync(userId.Value, deviceId);
        return Ok(new { replenished = true, remainingOneTimePreKeys = count });
    }

    /// <summary>
    /// Check remaining one-time pre-key count for the current device.
    /// </summary>
    [HttpGet("otpk-count/{deviceId:int}")]
    public async Task<IActionResult> GetOneTimePreKeyCount(int deviceId)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var count = await _keyBundleService.GetOneTimePreKeyCountAsync(userId.Value, deviceId);
        return Ok(new PreKeyCountDto(count));
    }
}
