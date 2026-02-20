using TelegramClone.Application.DTOs;

namespace TelegramClone.Application.Interfaces;

public interface IUserAppService
{
    Task<UserDto?> GetUserByIdAsync(Guid userId);
    Task<UserDto?> UpdateProfileAsync(Guid userId, UpdateProfileDto dto);
    Task<IEnumerable<UserDto>> SearchUsersAsync(string query);
    Task SetOnlineStatusAsync(Guid userId, bool isOnline);
}
