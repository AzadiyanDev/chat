using TelegramClone.Domain.Enums;

namespace TelegramClone.Domain.Entities;

/// <summary>
/// An encrypted message envelope queued for delivery.
/// The server NEVER sees plaintext content — only opaque ciphertext.
/// </summary>
public class MessageEnvelope : BaseEntity
{
    /// <summary>
    /// The recipient user ID (for routing).
    /// </summary>
    public Guid DestinationUserId { get; set; }
    public User DestinationUser { get; set; } = null!;

    /// <summary>
    /// The recipient's device ID (for per-device delivery).
    /// </summary>
    public int DestinationDeviceId { get; set; }

    /// <summary>
    /// Envelope type: PreKey, Normal, SenderKey.
    /// </summary>
    public EnvelopeType Type { get; set; }

    /// <summary>
    /// The encrypted Signal Protocol message (opaque ciphertext).
    /// Contains message body, attachment pointers, voice pointers — all encrypted.
    /// </summary>
    public byte[] Content { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// Server-assigned timestamp on receipt.
    /// </summary>
    public DateTime ServerTimestamp { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Whether this envelope has been fetched/acknowledged by the recipient.
    /// </summary>
    public bool IsDelivered { get; set; }

    /// <summary>
    /// Auto-expiry for undelivered envelopes (e.g., 30 days).
    /// </summary>
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(30);

    /// <summary>
    /// Optional: sender's ID for abuse prevention.
    /// In sealed-sender mode, this is null (sender is inside ciphertext).
    /// </summary>
    public Guid? SourceUserId { get; set; }

    /// <summary>
    /// Optional: sender's device ID.
    /// </summary>
    public int? SourceDeviceId { get; set; }
}
