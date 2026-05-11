using azadiyanChat.Application.DTOs;

namespace azadiyanChat.Application.Interfaces;

public interface IAuthService
{
    Task<AuthResultDto> RegisterAsync(RegisterDto dto);
    Task<AuthResultDto> LoginAsync(AuthDto dto);
    Task LogoutAsync();
    Task<UserDto?> GetCurrentUserAsync(string identityUserId);
}
