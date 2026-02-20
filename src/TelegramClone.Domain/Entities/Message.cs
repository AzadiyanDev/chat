using TelegramClone.Domain.Enums;

namespace TelegramClone.Domain.Entities;

public class Message : BaseEntity
{
    public Guid ChatId { get; set; }
    public Chat Chat { get; set; } = null!;

    public Guid SenderId { get; set; }
    public User Sender { get; set; } = null!;

    public string? Text { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public MessageStatus Status { get; set; } = MessageStatus.Sent;
    public bool IsDeleted { get; set; }

    // Self-referencing for reply
    public Guid? ReplyToId { get; set; }
    public Message? ReplyTo { get; set; }

    // Navigation properties
    public ICollection<Attachment> Attachments { get; set; } = new List<Attachment>();
    public VoiceNote? VoiceNote { get; set; }
    public ICollection<Reaction> Reactions { get; set; } = new List<Reaction>();
}
