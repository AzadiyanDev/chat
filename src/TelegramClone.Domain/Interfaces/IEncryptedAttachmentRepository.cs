using TelegramClone.Domain.Entities;

namespace TelegramClone.Domain.Interfaces;

public interface IEncryptedAttachmentRepository : IRepository<EncryptedAttachment>
{
    /// <summary>
    /// Get an attachment by ID only if the requesting user is the uploader
    /// or is an intended recipient (lightweight auth check).
    /// </summary>
    Task<EncryptedAttachment?> GetByIdIfAuthorizedAsync(Guid attachmentId, Guid requestingUserId);

    /// <summary>
    /// Update chunk upload progress.
    /// </summary>
    Task UpdateChunkProgressAsync(Guid attachmentId, int chunksUploaded, long ciphertextSize);

    /// <summary>
    /// Clean up expired or incomplete attachments.
    /// </summary>
    Task DeleteExpiredAsync();
}
