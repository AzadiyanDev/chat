namespace TelegramClone.Application.DTOs;

public class ChatMemberDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Username { get; set; }
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? LastSeen { get; set; }
    public string Role { get; set; } = "member";
    public DateTime JoinedAt { get; set; }
}

public class ChatMembersDto
{
    public bool CanManageMembers { get; set; }
    public List<ChatMemberDto> Members { get; set; } = new();
}

public enum ChatMemberMutationStatus
{
    Success,
    ChatNotFound,
    Forbidden,
    InvalidChatType,
    UserNotFound,
    NotMember,
    AlreadyMember,
    CannotRemoveOwner,
    CannotRemoveSelf
}

public class ChatMemberMutationResultDto
{
    public ChatMemberMutationStatus Status { get; set; }
    public ChatMemberDto? Member { get; set; }
}
