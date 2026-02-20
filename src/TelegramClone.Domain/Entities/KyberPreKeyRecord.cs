namespace TelegramClone.Domain.Entities;

/// <summary>
/// A post-quantum (ML-KEM/Kyber) pre-key for PQXDH session establishment.
/// Provides resistance against "harvest now, decrypt later" quantum attacks.
/// </summary>
public class KyberPreKeyRecord : BaseEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public int DeviceId { get; set; }

    /// <summary>
    /// Key identifier (monotonically increasing per device).
    /// </summary>
    public int KeyId { get; set; }

    /// <summary>
    /// ML-KEM-1024 public key (~1568 bytes).
    /// </summary>
    public byte[] PublicKey { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// Ed25519 signature over the public key, produced by the identity key.
    /// </summary>
    public byte[] Signature { get; set; } = Array.Empty<byte>();

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
