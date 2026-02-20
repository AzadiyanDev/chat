namespace TelegramClone.Domain.Entities;

/// <summary>
/// Stores the public identity key for a user's device.
/// The private key NEVER leaves the client device.
/// </summary>
public class IdentityKeyRecord : BaseEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public int DeviceId { get; set; }

    /// <summary>
    /// The device's registration ID (32-bit, per Signal Protocol).
    /// </summary>
    public int RegistrationId { get; set; }

    /// <summary>
    /// Curve25519 public identity key (33 bytes, compressed point).
    /// </summary>
    public byte[] PublicIdentityKey { get; set; } = Array.Empty<byte>();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
