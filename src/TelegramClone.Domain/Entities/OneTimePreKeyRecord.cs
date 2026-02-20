namespace TelegramClone.Domain.Entities;

/// <summary>
/// Ephemeral one-time pre-key consumed during X3DH/PQXDH session setup.
/// Each key is used exactly once, then deleted.
/// </summary>
public class OneTimePreKeyRecord : BaseEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public int DeviceId { get; set; }

    /// <summary>
    /// Key identifier.
    /// </summary>
    public int KeyId { get; set; }

    /// <summary>
    /// Curve25519 public key (33 bytes).
    /// </summary>
    public byte[] PublicKey { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// Whether this key has been consumed (handed out to another user).
    /// </summary>
    public bool IsConsumed { get; set; }
}
