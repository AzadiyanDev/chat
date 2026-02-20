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
        Directory.CreateDirectory(Path.Combine(_basePath, "attachments"));
    }

    public async Task<string> SaveVoiceNoteAsync(Stream stream, string fileName)
    {
        return await SaveToFolderAsync(stream, "voices", fileName);
    }

    public async Task<string> SaveAvatarAsync(Stream stream, string fileName)
    {
        return await SaveToFolderAsync(stream, "avatars", fileName);
    }

    public async Task<string> SaveAttachmentAsync(Stream stream, string fileName)
    {
        return await SaveToFolderAsync(stream, "attachments", fileName);
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

    private async Task<string> SaveToFolderAsync(Stream stream, string folder, string fileName)
    {
        var safeName = BuildSafeFileName(fileName);
        var path = Path.Combine(folder, $"{Guid.NewGuid()}_{safeName}");
        var fullPath = Path.Combine(_basePath, path);
        await using var fileStream = File.Create(fullPath);
        await stream.CopyToAsync(fileStream);
        return path.Replace("\\", "/");
    }

    private static string BuildSafeFileName(string? fileName)
    {
        var name = Path.GetFileName(fileName);
        if (string.IsNullOrWhiteSpace(name))
        {
            return "file.bin";
        }

        foreach (var invalid in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(invalid, '_');
        }

        const int maxLength = 180;
        if (name.Length > maxLength)
        {
            var extension = Path.GetExtension(name);
            var baseName = Path.GetFileNameWithoutExtension(name);
            var allowedBaseLength = Math.Max(1, maxLength - extension.Length);
            name = $"{baseName[..Math.Min(baseName.Length, allowedBaseLength)]}{extension}";
        }

        return name;
    }
}
