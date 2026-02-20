using TelegramClone.Domain.Enums;

namespace TelegramClone.Domain.Entities;

public class Attachment : BaseEntity
{
    public Guid MessageId { get; set; }
    public Message Message { get; set; } = null!;

    public AttachmentType Type { get; set; }
    public string Url { get; set; } = string.Empty;
    public string? Name { get; set; }
    public long? Size { get; set; }
    public string? ThumbnailUrl { get; set; }
}
