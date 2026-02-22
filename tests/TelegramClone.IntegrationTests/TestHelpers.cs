using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;
using TelegramClone.Infrastructure.Identity;

namespace TelegramClone.IntegrationTests;

/// <summary>
/// Helper methods for seeding test data and building common test fixtures.
/// </summary>
public static class TestHelpers
{
    /// <summary>
    /// Create a domain user (+ identity user) in the database for testing.
    /// Returns (domainUserId, identityUserId).
    /// </summary>
    public static async Task<(Guid DomainUserId, string IdentityUserId)> CreateTestUserAsync(
        IServiceProvider services, string email, string name, string? username = null)
    {
        using var scope = services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var db = scope.ServiceProvider.GetRequiredService<TelegramDbContext>();

        var identityUser = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true
        };
        var result = await userManager.CreateAsync(identityUser, "TestPass1!");
        if (!result.Succeeded)
            throw new Exception($"Failed to create identity user: {string.Join(", ", result.Errors.Select(e => e.Description))}");

        var domainUser = new User
        {
            Name = name,
            Username = username ?? email.Split('@')[0],
            IdentityUserId = identityUser.Id,
            IsOnline = false
        };
        db.DomainUsers.Add(domainUser);
        await db.SaveChangesAsync();

        return (domainUser.Id, identityUser.Id);
    }

    /// <summary>
    /// Register a device for a user.
    /// </summary>
    public static async Task<int> RegisterDeviceAsync(IServiceProvider services, Guid userId, string deviceName = "Test Device")
    {
        using var scope = services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var nextDeviceId = await unitOfWork.Devices.GetNextDeviceIdAsync(userId);
        var device = new DeviceRegistration
        {
            UserId = userId,
            DeviceId = nextDeviceId,
            DeviceName = deviceName,
            CreatedAt = DateTime.UtcNow,
            LastActiveAt = DateTime.UtcNow,
            IsActive = true
        };
        await unitOfWork.Devices.AddAsync(device);
        await unitOfWork.SaveChangesAsync();
        return nextDeviceId;
    }

    /// <summary>
    /// Seed N one-time pre-keys for a device.
    /// </summary>
    public static async Task SeedOneTimePreKeysAsync(
        IServiceProvider services, Guid userId, int deviceId, int count, int startKeyId = 1)
    {
        using var scope = services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var keys = Enumerable.Range(startKeyId, count).Select(i => new OneTimePreKeyRecord
        {
            UserId = userId,
            DeviceId = deviceId,
            KeyId = i,
            PublicKey = new byte[33], // dummy 33-byte key
            IsConsumed = false
        });

        await unitOfWork.KeyBundles.AddOneTimePreKeysAsync(keys);
        await unitOfWork.SaveChangesAsync();
    }

    /// <summary>
    /// Seed an identity key and signed pre-key for a device (required for FetchBundle to succeed).
    /// </summary>
    public static async Task SeedKeyBundleAsync(
        IServiceProvider services, Guid userId, int deviceId)
    {
        using var scope = services.CreateScope();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        await unitOfWork.KeyBundles.SetIdentityKeyAsync(new IdentityKeyRecord
        {
            UserId = userId,
            DeviceId = deviceId,
            RegistrationId = 12345,
            PublicIdentityKey = new byte[33],
            CreatedAt = DateTime.UtcNow
        });

        await unitOfWork.KeyBundles.SetSignedPreKeyAsync(new SignedPreKeyRecord
        {
            UserId = userId,
            DeviceId = deviceId,
            KeyId = 1,
            PublicKey = new byte[33],
            Signature = new byte[64],
            CreatedAt = DateTime.UtcNow
        });

        await unitOfWork.SaveChangesAsync();
    }
}
