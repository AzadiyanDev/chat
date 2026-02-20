using TelegramClone.Application.Interfaces;

namespace TelegramClone.Infrastructure.Services;

public class LocalFileStorageService : IFileStorageService
{
    private readonly string _basePath;

    public LocalFileStorageService(string basePath)
    {
        _basePath = basePath;
        Directory.CreateDirectory(Path.Combine(_basePath, "voices"));
        Directory.CreateDirectory(Path.Combine(_basePath, "avatars"));
    }

    public async Task<string> SaveVoiceNoteAsync(Stream stream, string fileName)
    {
        var path = Path.Combine("voices", $"{Guid.NewGuid()}_{fileName}");
        var fullPath = Path.Combine(_basePath, path);
        await using var fileStream = File.Create(fullPath);
        await stream.CopyToAsync(fileStream);
        return path.Replace("\\", "/");
    }

    public async Task<string> SaveAvatarAsync(Stream stream, string fileName)
    {
        var path = Path.Combine("avatars", $"{Guid.NewGuid()}_{fileName}");
        var fullPath = Path.Combine(_basePath, path);
        await using var fileStream = File.Create(fullPath);
        await stream.CopyToAsync(fileStream);
        return path.Replace("\\", "/");
    }

    public Task<Stream?> GetFileAsync(string path)
    {
        var fullPath = Path.Combine(_basePath, path);
        if (!File.Exists(fullPath)) return Task.FromResult<Stream?>(null);
        return Task.FromResult<Stream?>(File.OpenRead(fullPath));
    }

    public Task<bool> DeleteFileAsync(string path)
    {
        var fullPath = Path.Combine(_basePath, path);
        if (!File.Exists(fullPath)) return Task.FromResult(false);
        File.Delete(fullPath);
        return Task.FromResult(true);
    }
}
