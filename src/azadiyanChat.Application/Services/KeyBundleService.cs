using azadiyanChat.Application.DTOs;
using azadiyanChat.Application.Interfaces;
using azadiyanChat.Domain.Entities;
using azadiyanChat.Domain.Interfaces;

namespace azadiyanChat.Application.Services;

public class KeyBundleService : IKeyBundleService
{
    private readonly IUnitOfWork _unitOfWork;

    public KeyBundleService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task UploadBundleAsync(Guid userId, int deviceId, UploadKeyBundleDto dto)
    {
        // Store identity key
        var identityKey = new IdentityKeyRecord
        {
            UserId = userId,
            DeviceId = deviceId,
            RegistrationId = dto.RegistrationId,
            PublicIdentityKey = Convert.FromBase64String(dto.IdentityPublicKey),
            CreatedAt = DateTime.UtcNow
        };
        await _unitOfWork.KeyBundles.SetIdentityKeyAsync(identityKey);

        // Store signed pre-key
        var spk = new SignedPreKeyRecord
        {
            UserId = userId,
            DeviceId = deviceId,
            KeyId = dto.SignedPreKey.KeyId,
            PublicKey = Convert.FromBase64String(dto.SignedPreKey.PublicKey),
            Signature = Convert.FromBase64String(dto.SignedPreKey.Signature ?? ""),
            CreatedAt = DateTime.UtcNow
        };
        await _unitOfWork.KeyBundles.SetSignedPreKeyAsync(spk);

        // Store kyber pre-key (post-quantum) if provided
        if (dto.KyberPreKey != null)
        {
            var kpk = new KyberPreKeyRecord
            {
                UserId = userId,
                DeviceId = deviceId,
                KeyId = dto.KyberPreKey.KeyId,
                PublicKey = Convert.FromBase64String(dto.KyberPreKey.PublicKey),
                Signature = Convert.FromBase64String(dto.KyberPreKey.Signature ?? ""),
                CreatedAt = DateTime.UtcNow
            };
            await _unitOfWork.KeyBundles.SetKyberPreKeyAsync(kpk);
        }

        // Store one-time pre-keys
        if (dto.OneTimePreKeys.Count > 0)
        {
            var otpks = dto.OneTimePreKeys.Select(pk => new OneTimePreKeyRecord
            {
                UserId = userId,
                DeviceId = deviceId,
                KeyId = pk.KeyId,
                PublicKey = Convert.FromBase64String(pk.PublicKey),
                IsConsumed = false
            });
            await _unitOfWork.KeyBundles.AddOneTimePreKeysAsync(otpks);
        }

        await _unitOfWork.SaveChangesAsync();
    }

    public async Task<KeyBundleResponseDto?> FetchBundleAsync(Guid targetUserId, int targetDeviceId)
    {
        var identityKey = await _unitOfWork.KeyBundles.GetIdentityKeyAsync(targetUserId, targetDeviceId);
        if (identityKey == null) return null;

        var spk = await _unitOfWork.KeyBundles.GetSignedPreKeyAsync(targetUserId, targetDeviceId);
        if (spk == null) return null;

        var kpk = await _unitOfWork.KeyBundles.GetKyberPreKeyAsync(targetUserId, targetDeviceId);

        // Consume one OTP key atomically within an explicit transaction
        // The repository uses UPDLOCK/ROWLOCK/READPAST to prevent race conditions
        await using var _ = await _unitOfWork.BeginTransactionAsync();
        var otpk = await _unitOfWork.KeyBundles.ConsumeOneTimePreKeyAsync(targetUserId, targetDeviceId);
        await _unitOfWork.SaveChangesAsync();
        await _unitOfWork.CommitTransactionAsync();

        return new KeyBundleResponseDto(
            targetUserId,
            targetDeviceId,
            identityKey.RegistrationId,
            Convert.ToBase64String(identityKey.PublicIdentityKey),
            new PreKeyDto(spk.KeyId, Convert.ToBase64String(spk.PublicKey), Convert.ToBase64String(spk.Signature)),
            kpk != null ? new PreKeyDto(kpk.KeyId, Convert.ToBase64String(kpk.PublicKey), Convert.ToBase64String(kpk.Signature)) : null,
            otpk != null ? new PreKeyDto(otpk.KeyId, Convert.ToBase64String(otpk.PublicKey), null) : null
        );
    }

    public async Task<IEnumerable<KeyBundleResponseDto>> FetchAllDeviceBundlesAsync(Guid targetUserId)
    {
        var deviceIds = (await _unitOfWork.KeyBundles.GetDeviceIdsForUserAsync(targetUserId)).ToList();
        if (deviceIds.Count == 0) return Array.Empty<KeyBundleResponseDto>();

        // Batch-fetch identity keys, signed pre-keys, and kyber pre-keys in 3 queries (instead of N×3)
        var identityKeys = await _unitOfWork.KeyBundles.GetIdentityKeysForDevicesAsync(targetUserId, deviceIds);
        var signedPreKeys = await _unitOfWork.KeyBundles.GetSignedPreKeysForDevicesAsync(targetUserId, deviceIds);
        var kyberPreKeys = await _unitOfWork.KeyBundles.GetKyberPreKeysForDevicesAsync(targetUserId, deviceIds);

        var bundles = new List<KeyBundleResponseDto>();

        foreach (var deviceId in deviceIds)
        {
            if (!identityKeys.TryGetValue(deviceId, out var ik)) continue;
            if (!signedPreKeys.TryGetValue(deviceId, out var spk)) continue;
            kyberPreKeys.TryGetValue(deviceId, out var kpk);

            // OTPK consumption still per-device (requires atomicity with locking)
            await using var _ = await _unitOfWork.BeginTransactionAsync();
            var otpk = await _unitOfWork.KeyBundles.ConsumeOneTimePreKeyAsync(targetUserId, deviceId);
            await _unitOfWork.SaveChangesAsync();
            await _unitOfWork.CommitTransactionAsync();

            bundles.Add(new KeyBundleResponseDto(
                targetUserId,
                deviceId,
                ik.RegistrationId,
                Convert.ToBase64String(ik.PublicIdentityKey),
                new PreKeyDto(spk.KeyId, Convert.ToBase64String(spk.PublicKey), Convert.ToBase64String(spk.Signature)),
                kpk != null ? new PreKeyDto(kpk.KeyId, Convert.ToBase64String(kpk.PublicKey), Convert.ToBase64String(kpk.Signature)) : null,
                otpk != null ? new PreKeyDto(otpk.KeyId, Convert.ToBase64String(otpk.PublicKey), null) : null
            ));
        }

        return bundles;
    }

    public async Task ReplenishPreKeysAsync(Guid userId, int deviceId, ReplenishPreKeysDto dto)
    {
        var otpks = dto.OneTimePreKeys.Select(pk => new OneTimePreKeyRecord
        {
            UserId = userId,
            DeviceId = deviceId,
            KeyId = pk.KeyId,
            PublicKey = Convert.FromBase64String(pk.PublicKey),
            IsConsumed = false
        });

        await _unitOfWork.KeyBundles.AddOneTimePreKeysAsync(otpks);
        await _unitOfWork.KeyBundles.RemoveConsumedPreKeysAsync(userId, deviceId);
        await _unitOfWork.SaveChangesAsync();
    }

    public async Task<int> GetOneTimePreKeyCountAsync(Guid userId, int deviceId)
    {
        return await _unitOfWork.KeyBundles.GetAvailableOneTimePreKeyCountAsync(userId, deviceId);
    }
}
