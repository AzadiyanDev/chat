using TelegramClone.Application.DTOs;

namespace TelegramClone.Application.Interfaces;

/// <summary>
/// Manages Signal Protocol key bundles.
/// All key material is PUBLIC keys only — private keys never leave client devices.
/// </summary>
public interface IKeyBundleService
{
    /// <summary>
    /// Upload a full key bundle for a device (identity + signed prekey + optional kyber prekey + OTPKs).
    /// </summary>
    Task UploadBundleAsync(Guid userId, int deviceId, UploadKeyBundleDto bundleDto);

    /// <summary>
    /// Fetch a key bundle for a specific device, consuming one OTPK.
    /// Used by another user to establish a session.
    /// </summary>
    Task<KeyBundleResponseDto?> FetchBundleAsync(Guid targetUserId, int targetDeviceId);

    /// <summary>
    /// Fetch key bundles for ALL active devices of a user.
    /// </summary>
    Task<IEnumerable<KeyBundleResponseDto>> FetchAllDeviceBundlesAsync(Guid targetUserId);

    /// <summary>
    /// Upload additional one-time pre-keys (replenishment).
    /// </summary>
    Task ReplenishPreKeysAsync(Guid userId, int deviceId, ReplenishPreKeysDto dto);

    /// <summary>
    /// Get the count of remaining unused one-time pre-keys for a device.
    /// </summary>
    Task<int> GetOneTimePreKeyCountAsync(Guid userId, int deviceId);
}
