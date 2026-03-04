using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TelegramClone.Application.Interfaces;

namespace TelegramClone.Web.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class FilesController : ControllerBase
{
    private readonly IFileStorageService _fileStorage;

    public FilesController(IFileStorageService fileStorage)
    {
        _fileStorage = fileStorage;
    }

    private static readonly HashSet<string> AllowedVoiceTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg",
        "audio/wav", "audio/x-wav", "audio/aac", "video/webm"
    };

    private const long MaxVoiceFileSize = 20 * 1024 * 1024; // 20 MB

    [HttpPost("voice")]
    public async Task<IActionResult> UploadVoice(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file provided");

        if (file.Length > MaxVoiceFileSize)
            return BadRequest("Voice file too large (max 20 MB).");

        if (!AllowedVoiceTypes.Contains(file.ContentType))
            return BadRequest("Invalid audio file type.");

        // Sanitize filename: strip path components, keep only safe characters
        var safeName = Path.GetFileName(file.FileName)
            .Replace("..", "")
            .Replace("/", "")
            .Replace("\\", "");
        if (string.IsNullOrWhiteSpace(safeName))
            safeName = $"voice_{Guid.NewGuid():N}.webm";

        await using var stream = file.OpenReadStream();
        var path = await _fileStorage.SaveVoiceNoteAsync(stream, safeName);
        return Ok(new { url = $"/uploads/{path}" });
    }

    [HttpPost("avatar")]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file provided");

        await using var stream = file.OpenReadStream();
        var path = await _fileStorage.SaveAvatarAsync(stream, file.FileName);
        return Ok(new { url = $"/uploads/{path}" });
    }

    [HttpPost("attachment")]
    public async Task<IActionResult> UploadAttachment(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file provided");

        await using var stream = file.OpenReadStream();
        var path = await _fileStorage.SaveAttachmentAsync(stream, file.FileName);
        return Ok(new { url = $"/uploads/{path}" });
    }
}
