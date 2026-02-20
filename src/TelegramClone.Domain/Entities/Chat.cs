using TelegramClone.Domain.Enums;

namespace TelegramClone.Domain.Entities;

public class Chat : BaseEntity
{
    public ChatType Type { get; set; }
    public string? Name { get; set; }
    public string? AvatarUrl { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsPinned { get; set; }
    public bool IsArchived { get; set; }

    // Navigation properties
    public ICollection<ChatParticipant> Participants { get; set; } = new List<ChatParticipant>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
