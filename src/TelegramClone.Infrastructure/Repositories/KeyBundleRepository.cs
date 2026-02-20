using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class KeyBundleRepository : IKeyBundleRepository
{
    private readonly TelegramDbContext _context;

    public KeyBundleRepository(TelegramDbContext context)
    {
        _context = context;
    }

    // ──── Identity Keys ────

    public async Task<IdentityKeyRecord?> GetIdentityKeyAsync(Guid userId, int deviceId)
    {
        return await _context.IdentityKeys
            .FirstOrDefaultAsync(k => k.UserId == userId && k.DeviceId == deviceId);
    }

    public async Task SetIdentityKeyAsync(IdentityKeyRecord identityKey)
    {
        var existing = await GetIdentityKeyAsync(identityKey.UserId, identityKey.DeviceId);
        if (existing != null)
        {
            existing.PublicIdentityKey = identityKey.PublicIdentityKey;
            existing.RegistrationId = identityKey.RegistrationId;
            _context.IdentityKeys.Update(existing);
        }
        else
        {
            await _context.IdentityKeys.AddAsync(identityKey);
        }
    }

    // ──── Signed Pre-Keys ────

    public async Task<SignedPreKeyRecord?> GetSignedPreKeyAsync(Guid userId, int deviceId)
    {
        return await _context.SignedPreKeys
            .Where(k => k.UserId == userId && k.DeviceId == deviceId)
            .OrderByDescending(k => k.KeyId)
            .FirstOrDefaultAsync();
    }

    public async Task SetSignedPreKeyAsync(SignedPreKeyRecord signedPreKey)
    {
        await _context.SignedPreKeys.AddAsync(signedPreKey);
    }

    // ──── Kyber Pre-Keys ────

    public async Task<KyberPreKeyRecord?> GetKyberPreKeyAsync(Guid userId, int deviceId)
    {
        return await _context.KyberPreKeys
            .Where(k => k.UserId == userId && k.DeviceId == deviceId)
            .OrderByDescending(k => k.KeyId)
            .FirstOrDefaultAsync();
    }

    public async Task SetKyberPreKeyAsync(KyberPreKeyRecord kyberPreKey)
    {
        await _context.KyberPreKeys.AddAsync(kyberPreKey);
    }

    // ──── One-Time Pre-Keys ────

    public async Task<OneTimePreKeyRecord?> ConsumeOneTimePreKeyAsync(Guid userId, int deviceId)
    {
        var otpk = await _context.OneTimePreKeys
            .Where(k => k.UserId == userId && k.DeviceId == deviceId && !k.IsConsumed)
            .OrderBy(k => k.KeyId)
            .FirstOrDefaultAsync();

        if (otpk != null)
        {
            otpk.IsConsumed = true;
            _context.OneTimePreKeys.Update(otpk);
        }

        return otpk;
    }

    public async Task AddOneTimePreKeysAsync(IEnumerable<OneTimePreKeyRecord> preKeys)
    {
        await _context.OneTimePreKeys.AddRangeAsync(preKeys);
    }

    public async Task<int> GetAvailableOneTimePreKeyCountAsync(Guid userId, int deviceId)
    {
        return await _context.OneTimePreKeys
            .CountAsync(k => k.UserId == userId && k.DeviceId == deviceId && !k.IsConsumed);
    }

    public async Task RemoveConsumedPreKeysAsync(Guid userId, int deviceId)
    {
        var consumed = await _context.OneTimePreKeys
            .Where(k => k.UserId == userId && k.DeviceId == deviceId && k.IsConsumed)
            .ToListAsync();

        _context.OneTimePreKeys.RemoveRange(consumed);
    }

    // ──── Device IDs ────

    public async Task<IEnumerable<int>> GetDeviceIdsForUserAsync(Guid userId)
    {
        return await _context.IdentityKeys
            .Where(k => k.UserId == userId)
            .Select(k => k.DeviceId)
            .Distinct()
            .ToListAsync();
    }
}
