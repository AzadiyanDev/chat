using AutoMapper;
using Microsoft.AspNetCore.Identity;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Entities;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Identity;

namespace TelegramClone.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMapper _mapper;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IUnitOfWork unitOfWork,
        IMapper mapper)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _unitOfWork = unitOfWork;
        _mapper = mapper;
    }

    public async Task<AuthResultDto> RegisterAsync(RegisterDto dto)
    {
        // Create domain user first
        var domainUser = new User
        {
            Name = dto.Name,
            Username = dto.Username,
            IsOnline = true
        };
        await _unitOfWork.Users.AddAsync(domainUser);
        await _unitOfWork.SaveChangesAsync();

        // Create identity user
        var identityUser = new ApplicationUser
        {
            UserName = dto.Email,
            Email = dto.Email,
            DomainUserId = domainUser.Id
        };

        var result = await _userManager.CreateAsync(identityUser, dto.Password);
        if (!result.Succeeded)
        {
            // Rollback domain user
            _unitOfWork.Users.Remove(domainUser);
            await _unitOfWork.SaveChangesAsync();

            return new AuthResultDto
            {
                Succeeded = false,
                Error = string.Join(", ", result.Errors.Select(e => e.Description))
            };
        }

        // Link identity to domain user
        domainUser.IdentityUserId = identityUser.Id;
        _unitOfWork.Users.Update(domainUser);
        await _unitOfWork.SaveChangesAsync();

        // Sign in
        await _signInManager.SignInAsync(identityUser, isPersistent: true);

        return new AuthResultDto
        {
            Succeeded = true,
            User = _mapper.Map<UserDto>(domainUser)
        };
    }

    public async Task<AuthResultDto> LoginAsync(AuthDto dto)
    {
        var result = await _signInManager.PasswordSignInAsync(
            dto.Email, dto.Password, isPersistent: true, lockoutOnFailure: false);

        if (!result.Succeeded)
        {
            return new AuthResultDto
            {
                Succeeded = false,
                Error = "Invalid email or password"
            };
        }

        var identityUser = await _userManager.FindByEmailAsync(dto.Email);
        if (identityUser == null)
        {
            return new AuthResultDto { Succeeded = false, Error = "User not found" };
        }

        var domainUser = await _unitOfWork.Users.GetByIdentityIdAsync(identityUser.Id);
        if (domainUser != null)
        {
            domainUser.IsOnline = true;
            domainUser.LastSeen = null;
            _unitOfWork.Users.Update(domainUser);
            await _unitOfWork.SaveChangesAsync();
        }

        return new AuthResultDto
        {
            Succeeded = true,
            User = domainUser != null ? _mapper.Map<UserDto>(domainUser) : null
        };
    }

    public async Task LogoutAsync()
    {
        await _signInManager.SignOutAsync();
    }

    public async Task<UserDto?> GetCurrentUserAsync(string identityUserId)
    {
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityUserId);
        return user != null ? _mapper.Map<UserDto>(user) : null;
    }
}
