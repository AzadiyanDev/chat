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
            .AsNoTracking()
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
            .AsNoTracking()
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
            .AsNoTracking()
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
        OneTimePreKeyRecord? otpk;

        if (_context.Database.IsSqlServer())
        {
            // Atomic OTPK consumption using raw SQL with locking hints.
            // UPDLOCK: take an update lock to prevent other readers from selecting the same row
            // ROWLOCK: lock at row level (not page/table)
            // READPAST: skip rows locked by other transactions (prevents blocking)
            // This ensures that concurrent requests never consume the same OTPK.
            otpk = await _context.OneTimePreKeys
                .FromSqlRaw(
                    @"SELECT TOP(1) * FROM [OneTimePreKeys] WITH (UPDLOCK, ROWLOCK, READPAST)
                      WHERE [UserId] = {0} AND [DeviceId] = {1} AND [IsConsumed] = 0
                      ORDER BY [KeyId]",
                    userId, deviceId)
                .FirstOrDefaultAsync();
        }
        else
        {
            // Fallback for non-SQL Server providers (InMemory, SQLite, etc.)
            otpk = await _context.OneTimePreKeys
                .Where(k => k.UserId == userId && k.DeviceId == deviceId && !k.IsConsumed)
                .OrderBy(k => k.KeyId)
                .FirstOrDefaultAsync();
        }

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
            .AsNoTracking()
            .CountAsync(k => k.UserId == userId && k.DeviceId == deviceId && !k.IsConsumed);
    }

    public async Task RemoveConsumedPreKeysAsync(Guid userId, int deviceId)
    {
        await _context.OneTimePreKeys
            .Where(k => k.UserId == userId && k.DeviceId == deviceId && k.IsConsumed)
            .ExecuteDeleteAsync();
    }

    // ──── Device IDs ────

    public async Task<IEnumerable<int>> GetDeviceIdsForUserAsync(Guid userId)
    {
        return await _context.IdentityKeys
            .AsNoTracking()
            .Where(k => k.UserId == userId)
            .Select(k => k.DeviceId)
            .Distinct()
            .ToListAsync();
    }

    // ──── Batch Fetch (avoids N+1 in FetchAllDeviceBundlesAsync) ────

    public async Task<Dictionary<int, IdentityKeyRecord>> GetIdentityKeysForDevicesAsync(Guid userId, IEnumerable<int> deviceIds)
    {
        var ids = deviceIds.ToList();
        return await _context.IdentityKeys
            .AsNoTracking()
            .Where(k => k.UserId == userId && ids.Contains(k.DeviceId))
            .GroupBy(k => k.DeviceId)
            .Select(g => g.First())
            .ToDictionaryAsync(k => k.DeviceId);
    }

    public async Task<Dictionary<int, SignedPreKeyRecord>> GetSignedPreKeysForDevicesAsync(Guid userId, IEnumerable<int> deviceIds)
    {
        var ids = deviceIds.ToList();
        // Get the latest signed pre-key per device
        var keys = await _context.SignedPreKeys
            .AsNoTracking()
            .Where(k => k.UserId == userId && ids.Contains(k.DeviceId))
            .ToListAsync();

        return keys
            .GroupBy(k => k.DeviceId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(k => k.KeyId).First());
    }

    public async Task<Dictionary<int, KyberPreKeyRecord>> GetKyberPreKeysForDevicesAsync(Guid userId, IEnumerable<int> deviceIds)
    {
        var ids = deviceIds.ToList();
        var keys = await _context.KyberPreKeys
            .AsNoTracking()
            .Where(k => k.UserId == userId && ids.Contains(k.DeviceId))
            .ToListAsync();

        return keys
            .GroupBy(k => k.DeviceId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(k => k.KeyId).First());
    }
}
