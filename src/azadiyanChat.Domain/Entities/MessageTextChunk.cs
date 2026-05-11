namespace azadiyanChat.Domain.Entities;

public class MessageTextChunk : BaseEntity
{
    public Guid MessageId { get; set; }
    public Message Message { get; set; } = null!;

    public int ChunkIndex { get; set; }

    // Encrypted chunk payload format:
    // [1-byte version][12-byte nonce][16-byte tag][ciphertext...]
    public byte[] Payload { get; set; } = Array.Empty<byte>();
}
