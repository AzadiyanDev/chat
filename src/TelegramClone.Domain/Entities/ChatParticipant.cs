namespace TelegramClone.Domain.Entities;

public class ChatParticipant
{
    public Guid ChatId { get; set; }
    public Chat Chat { get; set; } = null!;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public string Role { get; set; } = "member"; // owner, admin, member
}
