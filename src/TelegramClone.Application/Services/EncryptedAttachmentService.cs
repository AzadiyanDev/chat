using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Application.Services;

public class EncryptedAttachmentService : IEncryptedAttachmentService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly string _storagePath;

    public EncryptedAttachmentService(IUnitOfWork unitOfWork, string storagePath)
    {
        _unitOfWork = unitOfWork;
        _storagePath = storagePath;
    }

    public async Task<InitiateUploadResponseDto> InitiateUploadAsync(Guid userId)
    {
        var attachment = new EncryptedAttachment
        {
            UploaderId = userId,
            StoragePath = "", // Will be set during chunk upload
            CiphertextSize = 0,
            ChunksUploaded = 0,
            TotalChunks = 0,
            IsComplete = false,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = DateTime.UtcNow.AddDays(90)
        };

        // Create storage directory for this attachment
        var attachmentDir = Path.Combine(_storagePath, "encrypted", attachment.Id.ToString());
        Directory.CreateDirectory(attachmentDir);
        attachment.StoragePath = attachmentDir;

        await _unitOfWork.EncryptedAttachments.AddAsync(attachment);
        await _unitOfWork.SaveChangesAsync();

        return new InitiateUploadResponseDto(
            attachment.Id,
            $"/api/attachments/{attachment.Id}/chunks"
        );
    }

    public async Task UploadChunkAsync(Guid attachmentId, Guid userId, Stream ciphertextChunk, int chunkIndex)
    {
        var attachment = await _unitOfWork.EncryptedAttachments.GetByIdAsync(attachmentId);
        if (attachment == null || attachment.UploaderId != userId)
            throw new UnauthorizedAccessException("Not authorized to upload to this attachment.");

        if (attachment.IsComplete)
            throw new InvalidOperationException("Upload already completed.");

        // Write chunk to disk
        var chunkPath = Path.Combine(attachment.StoragePath, $"chunk_{chunkIndex:D6}");
        await using var fileStream = new FileStream(chunkPath, FileMode.Create, FileAccess.Write);
        await ciphertextChunk.CopyToAsync(fileStream);
        var chunkSize = fileStream.Length;

        // Update metadata
        attachment.ChunksUploaded++;
        attachment.CiphertextSize += chunkSize;
        _unitOfWork.EncryptedAttachments.Update(attachment);
        await _unitOfWork.SaveChangesAsync();
    }

    public async Task<CompleteUploadResponseDto> CompleteUploadAsync(Guid attachmentId, Guid userId)
    {
        var attachment = await _unitOfWork.EncryptedAttachments.GetByIdAsync(attachmentId);
        if (attachment == null || attachment.UploaderId != userId)
            throw new UnauthorizedAccessException("Not authorized.");

        // Concatenate all chunks into a single file
        var finalPath = Path.Combine(attachment.StoragePath, "ciphertext.bin");
        await using (var outputStream = new FileStream(finalPath, FileMode.Create, FileAccess.Write))
        {
            for (int i = 0; i < attachment.ChunksUploaded; i++)
            {
                var chunkPath = Path.Combine(attachment.StoragePath, $"chunk_{i:D6}");
                if (File.Exists(chunkPath))
                {
                    await using var chunkStream = File.OpenRead(chunkPath);
                    await chunkStream.CopyToAsync(outputStream);
                }
            }
        }

        // Clean up individual chunk files
        for (int i = 0; i < attachment.ChunksUploaded; i++)
        {
            var chunkPath = Path.Combine(attachment.StoragePath, $"chunk_{i:D6}");
            if (File.Exists(chunkPath)) File.Delete(chunkPath);
        }

        attachment.IsComplete = true;
        attachment.CiphertextSize = new FileInfo(finalPath).Length;
        _unitOfWork.EncryptedAttachments.Update(attachment);
        await _unitOfWork.SaveChangesAsync();

        return new CompleteUploadResponseDto(attachment.Id, attachment.CiphertextSize, true);
    }

    public async Task<(Stream CiphertextStream, long Size)?> DownloadCiphertextAsync(Guid attachmentId, Guid userId)
    {
        var attachment = await _unitOfWork.EncryptedAttachments.GetByIdAsync(attachmentId);
        if (attachment == null || !attachment.IsComplete)
            return null;

        var filePath = Path.Combine(attachment.StoragePath, "ciphertext.bin");
        if (!File.Exists(filePath)) return null;

        var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        return (stream, attachment.CiphertextSize);
    }
}
