using TelegramClone.Domain.Entities;

namespace TelegramClone.Domain.Interfaces;

public interface IKeyBundleRepository
{
    // Identity Keys
    Task<IdentityKeyRecord?> GetIdentityKeyAsync(Guid userId, int deviceId);
    Task SetIdentityKeyAsync(IdentityKeyRecord identityKey);

    // Signed Pre-Keys
    Task<SignedPreKeyRecord?> GetSignedPreKeyAsync(Guid userId, int deviceId);
    Task SetSignedPreKeyAsync(SignedPreKeyRecord signedPreKey);

    // Kyber Pre-Keys (Post-Quantum)
    Task<KyberPreKeyRecord?> GetKyberPreKeyAsync(Guid userId, int deviceId);
    Task SetKyberPreKeyAsync(KyberPreKeyRecord kyberPreKey);

    // One-Time Pre-Keys
    Task<OneTimePreKeyRecord?> ConsumeOneTimePreKeyAsync(Guid userId, int deviceId);
    Task AddOneTimePreKeysAsync(IEnumerable<OneTimePreKeyRecord> preKeys);
    Task<int> GetAvailableOneTimePreKeyCountAsync(Guid userId, int deviceId);
    Task RemoveConsumedPreKeysAsync(Guid userId, int deviceId);

    // Full bundle retrieval (for session setup)
    Task<IEnumerable<int>> GetDeviceIdsForUserAsync(Guid userId);
}
