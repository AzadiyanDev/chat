using AutoMapper;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Application.Services;

public class UserAppService : IUserAppService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMapper _mapper;

    public UserAppService(IUnitOfWork unitOfWork, IMapper mapper)
    {
        _unitOfWork = unitOfWork;
        _mapper = mapper;
    }

    public async Task<UserDto?> GetUserByIdAsync(Guid userId)
    {
        var user = await _unitOfWork.Users.GetByIdAsync(userId);
        return user == null ? null : _mapper.Map<UserDto>(user);
    }

    public async Task<UserDto?> UpdateProfileAsync(Guid userId, UpdateProfileDto dto)
    {
        var user = await _unitOfWork.Users.GetByIdAsync(userId);
        if (user == null) return null;

        user.Name = dto.Name;
        user.Username = dto.Username;
        user.Bio = dto.Bio;
        if (dto.AvatarUrl != null) user.AvatarUrl = dto.AvatarUrl;

        _unitOfWork.Users.Update(user);
        await _unitOfWork.SaveChangesAsync();

        return _mapper.Map<UserDto>(user);
    }

    public async Task<IEnumerable<UserDto>> SearchUsersAsync(string query)
    {
        var users = await _unitOfWork.Users.SearchUsersAsync(query);
        return _mapper.Map<IEnumerable<UserDto>>(users);
    }

    public async Task SetOnlineStatusAsync(Guid userId, bool isOnline)
    {
        await _unitOfWork.Users.UpdateOnlineStatusAsync(userId, isOnline);
        await _unitOfWork.SaveChangesAsync();
    }
}
