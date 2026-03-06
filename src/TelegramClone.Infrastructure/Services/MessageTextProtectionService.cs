using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TelegramClone.Application.Interfaces;

namespace TelegramClone.Infrastructure.Services;

public class MessageTextProtectionService : IMessageTextProtectionService
{
    private const byte CurrentVersion = 2;
    private const int NonceSize = 12;
    private const int TagSize = 16;
    private const int KeySize = 32;
    private const int AadSize = 16 + 16 + 4;

    private static readonly byte[] ChatContextPrefix = Encoding.ASCII.GetBytes("tc-chat-key-v1");
    private static readonly byte[] MessageContextPrefix = Encoding.ASCII.GetBytes("tc-message-key-v1");
    private static readonly byte[] ChunkContextPrefix = Encoding.ASCII.GetBytes("tc-chunk-key-v1");

    private readonly byte[] _masterKey;
    private readonly int _chunkSizeBytes;

    public MessageTextProtectionService(
        IOptions<MessageTextProtectionOptions> options,
        IHostEnvironment hostEnvironment)
    {
        var value = options.Value;
        _chunkSizeBytes = value.ChunkSizeBytes <= 0 ? 512 : value.ChunkSizeBytes;

        var configuredKey = string.IsNullOrWhiteSpace(value.MasterKey)
            ? value.Key
            : value.MasterKey;

        if (string.IsNullOrWhiteSpace(configuredKey))
        {
            if (hostEnvironment.IsProduction())
                throw new InvalidOperationException("MessageTextProtection:MasterKey is required in production and must be a Base64-encoded 32-byte key.");

            // Non-production fallback key for local/dev/test execution.
            var fallbackSeed = $"TelegramClone::{hostEnvironment.EnvironmentName}::{Environment.MachineName}";
            _masterKey = SHA256.HashData(Encoding.UTF8.GetBytes(fallbackSeed));
            return;
        }

        try
        {
            _masterKey = Convert.FromBase64String(configuredKey);
        }
        catch (FormatException ex)
        {
            throw new InvalidOperationException("MessageTextProtection:MasterKey must be valid Base64.", ex);
        }

        if (_masterKey.Length != KeySize)
            throw new InvalidOperationException("MessageTextProtection:MasterKey must decode to exactly 32 bytes (256-bit key).");
    }

    public IReadOnlyList<MessageTextEncryptedChunk> Encrypt(Guid chatId, Guid messageId, string plaintext)
    {
        if (string.IsNullOrEmpty(plaintext))
            return Array.Empty<MessageTextEncryptedChunk>();

        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var chunks = new List<MessageTextEncryptedChunk>();
        var chatKey = DeriveScopedKey(_masterKey, ChatContextPrefix, chatId);
        var messageKey = DeriveScopedKey(chatKey, MessageContextPrefix, messageId);

        try
        {
            var chunkIndex = 0;
            for (var offset = 0; offset < plainBytes.Length; offset += _chunkSizeBytes)
            {
                var length = Math.Min(_chunkSizeBytes, plainBytes.Length - offset);
                var plainChunk = new ReadOnlySpan<byte>(plainBytes, offset, length);

                var nonce = RandomNumberGenerator.GetBytes(NonceSize);
                var ciphertext = new byte[length];
                var tag = new byte[TagSize];
                var chunkKey = DeriveChunkKey(messageKey, chunkIndex);

                try
                {
                    using var aes = new AesGcm(chunkKey, TagSize);
                    var aad = BuildAad(chatId, messageId, chunkIndex);
                    aes.Encrypt(nonce, plainChunk, ciphertext, tag, aad);
                }
                finally
                {
                    CryptographicOperations.ZeroMemory(chunkKey);
                }

                var payload = new byte[1 + NonceSize + TagSize + ciphertext.Length];
                payload[0] = CurrentVersion;
                Buffer.BlockCopy(nonce, 0, payload, 1, NonceSize);
                Buffer.BlockCopy(tag, 0, payload, 1 + NonceSize, TagSize);
                Buffer.BlockCopy(ciphertext, 0, payload, 1 + NonceSize + TagSize, ciphertext.Length);

                chunks.Add(new MessageTextEncryptedChunk(chunkIndex++, payload));
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(chatKey);
            CryptographicOperations.ZeroMemory(messageKey);
        }

        return chunks;
    }

    public string? Decrypt(
        Guid chatId,
        Guid messageId,
        IEnumerable<MessageTextEncryptedChunk>? chunks,
        string? fallbackPlaintext = null)
    {
        if (chunks == null)
            return fallbackPlaintext;

        var chunkList = chunks
            .Where(c => c.Payload != null && c.Payload.Length > 0)
            .OrderBy(c => c.ChunkIndex)
            .ToList();
        if (chunkList.Count == 0)
            return fallbackPlaintext;

        var chatKey = DeriveScopedKey(_masterKey, ChatContextPrefix, chatId);
        var messageKey = DeriveScopedKey(chatKey, MessageContextPrefix, messageId);
        using var output = new MemoryStream();

        try
        {
            foreach (var chunk in chunkList)
            {
                var payload = chunk.Payload;
                if (payload.Length < 1 + NonceSize + TagSize)
                    throw new InvalidOperationException("Encrypted message chunk payload is invalid.");

                var version = payload[0];
                if (version != CurrentVersion)
                    throw new InvalidOperationException($"Unsupported encrypted message chunk version '{version}'.");

                var nonce = new byte[NonceSize];
                var tag = new byte[TagSize];
                var cipherLength = payload.Length - 1 - NonceSize - TagSize;
                var ciphertext = new byte[cipherLength];
                var plainChunk = new byte[cipherLength];

                Buffer.BlockCopy(payload, 1, nonce, 0, NonceSize);
                Buffer.BlockCopy(payload, 1 + NonceSize, tag, 0, TagSize);
                Buffer.BlockCopy(payload, 1 + NonceSize + TagSize, ciphertext, 0, cipherLength);

                var chunkKey = DeriveChunkKey(messageKey, chunk.ChunkIndex);
                try
                {
                    using var aes = new AesGcm(chunkKey, TagSize);
                    var aad = BuildAad(chatId, messageId, chunk.ChunkIndex);
                    aes.Decrypt(nonce, ciphertext, tag, plainChunk, aad);
                }
                finally
                {
                    CryptographicOperations.ZeroMemory(chunkKey);
                }

                output.Write(plainChunk);
            }
        }
        finally
        {
            CryptographicOperations.ZeroMemory(chatKey);
            CryptographicOperations.ZeroMemory(messageKey);
        }

        return Encoding.UTF8.GetString(output.ToArray());
    }

    private static byte[] DeriveScopedKey(byte[] parentKey, byte[] prefix, Guid scopeId)
    {
        var context = new byte[prefix.Length + 16];
        Buffer.BlockCopy(prefix, 0, context, 0, prefix.Length);
        scopeId.TryWriteBytes(context.AsSpan(prefix.Length, 16));
        return HMACSHA256.HashData(parentKey, context);
    }

    private static byte[] DeriveChunkKey(byte[] messageKey, int chunkIndex)
    {
        Span<byte> context = stackalloc byte[ChunkContextPrefix.Length + 4];
        ChunkContextPrefix.CopyTo(context);
        BinaryPrimitives.WriteInt32BigEndian(context[ChunkContextPrefix.Length..], chunkIndex);
        return HMACSHA256.HashData(messageKey, context);
    }

    private static byte[] BuildAad(Guid chatId, Guid messageId, int chunkIndex)
    {
        Span<byte> aad = stackalloc byte[AadSize];
        chatId.TryWriteBytes(aad);
        messageId.TryWriteBytes(aad[16..]);
        BinaryPrimitives.WriteInt32BigEndian(aad[32..], chunkIndex);
        return aad.ToArray();
    }
}
