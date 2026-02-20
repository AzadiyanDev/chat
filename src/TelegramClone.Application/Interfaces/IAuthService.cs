using TelegramClone.Application.DTOs;

namespace TelegramClone.Application.Interfaces;

public interface IAuthService
{
    Task<AuthResultDto> RegisterAsync(RegisterDto dto);
    Task<AuthResultDto> LoginAsync(AuthDto dto);
    Task LogoutAsync();
    Task<UserDto?> GetCurrentUserAsync(string identityUserId);
}
