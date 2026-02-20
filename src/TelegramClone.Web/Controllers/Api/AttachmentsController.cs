using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Web.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AttachmentsController : ControllerBase
{
    private readonly IEncryptedAttachmentService _attachmentService;
    private readonly IUnitOfWork _unitOfWork;

    public AttachmentsController(IEncryptedAttachmentService attachmentService, IUnitOfWork unitOfWork)
    {
        _attachmentService = attachmentService;
        _unitOfWork = unitOfWork;
    }

    private async Task<Guid?> GetCurrentDomainUserIdAsync()
    {
        var identityId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityId)) return null;
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityId);
        return user?.Id;
    }

    /// <summary>
    /// Initiate a new encrypted attachment upload.
    /// Returns an attachment ID and upload URL.
    /// </summary>
    [HttpPost("upload")]
    public async Task<IActionResult> InitiateUpload()
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _attachmentService.InitiateUploadAsync(userId.Value);
        return Ok(result);
    }

    /// <summary>
    /// Upload ciphertext chunk(s) for an attachment.
    /// Client encrypts file locally, then streams encrypted chunks here.
    /// Server stores only ciphertext — NEVER sees plaintext.
    /// </summary>
    [HttpPut("{attachmentId:guid}/chunks/{chunkIndex:int}")]
    [RequestSizeLimit(70_000_000)] // ~67MB per chunk max (64MB ciphertext + overhead)
    public async Task<IActionResult> UploadChunk(Guid attachmentId, int chunkIndex)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        await _attachmentService.UploadChunkAsync(attachmentId, userId.Value, Request.Body, chunkIndex);
        return Ok(new { chunkIndex, uploaded = true });
    }

    /// <summary>
    /// Finalize an upload. Server concatenates chunks into final ciphertext blob.
    /// </summary>
    [HttpPost("{attachmentId:guid}/complete")]
    public async Task<IActionResult> CompleteUpload(Guid attachmentId)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _attachmentService.CompleteUploadAsync(attachmentId, userId.Value);
        return Ok(result);
    }

    /// <summary>
    /// Download the ciphertext blob for an attachment.
    /// Client decrypts locally using the content key received in the E2EE message.
    /// </summary>
    [HttpGet("{attachmentId:guid}")]
    public async Task<IActionResult> DownloadCiphertext(Guid attachmentId)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _attachmentService.DownloadCiphertextAsync(attachmentId, userId.Value);
        if (result == null) return NotFound(new { error = "Attachment not found or not ready." });

        var (stream, size) = result.Value;

        // Serve as opaque binary — no Content-Type hint (server doesn't know the file type)
        Response.Headers.Append("Content-Length", size.ToString());
        Response.Headers.Append("Cache-Control", "private, max-age=86400"); // 24h client cache
        return File(stream, "application/octet-stream");
    }
}
