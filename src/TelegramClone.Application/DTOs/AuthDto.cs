namespace TelegramClone.Application.DTOs;

public class AuthDto
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class RegisterDto
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Username { get; set; }
}

public class AuthResultDto
{
    public bool Succeeded { get; set; }
    public string? Error { get; set; }
    public UserDto? User { get; set; }
}
