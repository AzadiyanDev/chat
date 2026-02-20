using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class EncryptedAttachmentRepository : Repository<EncryptedAttachment>, IEncryptedAttachmentRepository
{
    public EncryptedAttachmentRepository(TelegramDbContext context) : base(context) { }

    public async Task<EncryptedAttachment?> GetByIdIfAuthorizedAsync(Guid attachmentId, Guid requestingUserId)
    {
        // For now, any authenticated user can download (auth is verified at controller level).
        // In future, access control can be based on message recipient lists.
        return await _dbSet
            .FirstOrDefaultAsync(a => a.Id == attachmentId && a.IsComplete);
    }

    public async Task UpdateChunkProgressAsync(Guid attachmentId, int chunksUploaded, long ciphertextSize)
    {
        await _dbSet
            .Where(a => a.Id == attachmentId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(a => a.ChunksUploaded, chunksUploaded)
                .SetProperty(a => a.CiphertextSize, ciphertextSize));
    }

    public async Task DeleteExpiredAsync()
    {
        var expired = await _dbSet
            .Where(a => a.ExpiresAt <= DateTime.UtcNow)
            .ToListAsync();

        foreach (var att in expired)
        {
            // Delete files from disk
            if (Directory.Exists(att.StoragePath))
            {
                Directory.Delete(att.StoragePath, recursive: true);
            }
        }

        _dbSet.RemoveRange(expired);
    }
}
