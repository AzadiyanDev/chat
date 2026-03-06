namespace TelegramClone.Application.Interfaces;

public sealed record MessageTextEncryptedChunk(int ChunkIndex, byte[] Payload);

public interface IMessageTextProtectionService
{
    IReadOnlyList<MessageTextEncryptedChunk> Encrypt(Guid chatId, Guid messageId, string plaintext);
    string? Decrypt(
        Guid chatId,
        Guid messageId,
        IEnumerable<MessageTextEncryptedChunk>? chunks,
        string? fallbackPlaintext = null);
}
