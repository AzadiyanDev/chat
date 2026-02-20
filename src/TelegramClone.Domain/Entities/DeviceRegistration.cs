namespace TelegramClone.Domain.Entities;

/// <summary>
/// Represents a user's registered device. Each device has its own identity key
/// and maintains independent Signal Protocol sessions.
/// </summary>
public class DeviceRegistration : BaseEntity
{
    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    /// <summary>
    /// Integer device identifier, unique per user.
    /// </summary>
    public int DeviceId { get; set; }

    /// <summary>
    /// Optional human-readable device name (e.g., "Chrome on Windows").
    /// Stored encrypted client-side; server sees ciphertext or null.
    /// </summary>
    public string? DeviceName { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastActiveAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Whether this device registration is still active.
    /// </summary>
    public bool IsActive { get; set; } = true;
}
