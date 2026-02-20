namespace TelegramClone.Domain.Entities;

/// <summary>
/// A signed pre-key uploaded by a device, used in X3DH/PQXDH key agreement.
/// Rotated periodically (e.g., every 7 days).
/// </summary>
public class SignedPreKeyRecord : BaseEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public int DeviceId { get; set; }

    /// <summary>
    /// Key identifier (monotonically increasing per device).
    /// </summary>
    public int KeyId { get; set; }

    /// <summary>
    /// Curve25519 public key (33 bytes).
    /// </summary>
    public byte[] PublicKey { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// Ed25519 signature over the public key, produced by the identity key.
    /// </summary>
    public byte[] Signature { get; set; } = Array.Empty<byte>();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
