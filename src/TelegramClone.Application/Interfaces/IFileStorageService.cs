namespace TelegramClone.Application.Interfaces;

public interface IFileStorageService
{
    Task<string> SaveVoiceNoteAsync(Stream stream, string fileName);
    Task<string> SaveAvatarAsync(Stream stream, string fileName);
    Task<Stream?> GetFileAsync(string path);
    Task<bool> DeleteFileAsync(string path);
}
