using TelegramClone.Domain.Enums;

namespace TelegramClone.Application.DTOs;

public class ChatDto
{
    public Guid Id { get; set; }
    public ChatType Type { get; set; }
    public string? Name { get; set; }
    public string? AvatarUrl { get; set; }
    public string? Description { get; set; }
    public bool IsPinned { get; set; }
    public bool IsArchived { get; set; }
    public int MemberCount { get; set; }
    public List<UserDto> Participants { get; set; } = new();
    public MessageDto? LastMessage { get; set; }
    public int UnreadCount { get; set; }
}

public class ChatListItemDto
{
    public Guid Id { get; set; }
    public ChatType Type { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public bool IsPinned { get; set; }
    public int UnreadCount { get; set; }
    public MessageDto? LastMessage { get; set; }
    public List<UserDto> Participants { get; set; } = new();
}

public class CreateChatDto
{
    public ChatType Type { get; set; }
    public string? Name { get; set; }
    public string? Description { get; set; }
    public List<Guid> ParticipantIds { get; set; } = new();
}
