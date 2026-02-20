using TelegramClone.Application.DTOs;

namespace TelegramClone.Application.Interfaces;

/// <summary>
/// Manages encrypted attachment uploads and downloads.
/// Server stores only ciphertext blobs — no knowledge of file types, names, or content.
/// </summary>
public interface IEncryptedAttachmentService
{
    /// <summary>
    /// Initiate a new upload. Returns an attachment ID and upload URL.
    /// </summary>
    Task<InitiateUploadResponseDto> InitiateUploadAsync(Guid userId);

    /// <summary>
    /// Write ciphertext data for an attachment (supports chunked/resumable upload).
    /// </summary>
    Task UploadChunkAsync(Guid attachmentId, Guid userId, Stream ciphertextChunk, int chunkIndex);

    /// <summary>
    /// Finalize an upload, marking it as complete.
    /// </summary>
    Task<CompleteUploadResponseDto> CompleteUploadAsync(Guid attachmentId, Guid userId);

    /// <summary>
    /// Get a stream of the ciphertext for download.
    /// </summary>
    Task<(Stream CiphertextStream, long Size)?> DownloadCiphertextAsync(Guid attachmentId, Guid userId);
}
