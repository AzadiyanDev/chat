namespace TelegramClone.Domain.Entities;

public class User : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string? Username { get; set; }
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? LastSeen { get; set; }

    /// <summary>
    /// Maps to the ASP.NET Identity user Id.
    /// </summary>
    public string? IdentityUserId { get; set; }

    // Navigation properties
    public ICollection<ChatParticipant> ChatParticipants { get; set; } = new List<ChatParticipant>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
    public ICollection<Reaction> Reactions { get; set; } = new List<Reaction>();
}
