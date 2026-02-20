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

    [HttpPost("voice")]
    public async Task<IActionResult> UploadVoice(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file provided");

        await using var stream = file.OpenReadStream();
        var path = await _fileStorage.SaveVoiceNoteAsync(stream, file.FileName);
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
}
