namespace TelegramClone.Application.DTOs;

public class UserDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Username { get; set; }
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
    public bool IsOnline { get; set; }
    public DateTime? LastSeen { get; set; }
}

public class UpdateProfileDto
{
    public string Name { get; set; } = string.Empty;
    public string? Username { get; set; }
    public string? Bio { get; set; }
    public string? AvatarUrl { get; set; }
}
