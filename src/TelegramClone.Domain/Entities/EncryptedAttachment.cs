namespace TelegramClone.Domain.Entities;

/// <summary>
/// Stores metadata about an encrypted attachment (file, voice, image).
/// The server stores only ciphertext — never plaintext.
/// The content key, filename, MIME type, etc. are inside the E2EE message.
/// </summary>
public class EncryptedAttachment : BaseEntity
{
    /// <summary>
    /// The user who uploaded this attachment.
    /// </summary>
    public Guid UploaderId { get; set; }
    public User Uploader { get; set; } = null!;

    /// <summary>
    /// Path to the ciphertext blob on storage (local disk or object store).
    /// </summary>
    public string StoragePath { get; set; } = string.Empty;

    /// <summary>
    /// Size of the ciphertext in bytes.
    /// </summary>
    public long CiphertextSize { get; set; }

    /// <summary>
    /// Number of chunks uploaded so far (for resumable uploads).
    /// </summary>
    public int ChunksUploaded { get; set; }

    /// <summary>
    /// Total expected chunks (set on initiation, 0 = unknown/streaming).
    /// </summary>
    public int TotalChunks { get; set; }

    /// <summary>
    /// Whether the upload is complete and finalized.
    /// </summary>
    public bool IsComplete { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Auto-expiry for attachments (configurable, e.g., 90 days).
    /// </summary>
    public DateTime ExpiresAt { get; set; } = DateTime.UtcNow.AddDays(90);
}
