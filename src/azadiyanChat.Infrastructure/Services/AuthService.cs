using AutoMapper;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using System.Security.Claims;
using azadiyanChat.Application.DTOs;
using azadiyanChat.Application.Interfaces;
using azadiyanChat.Domain.Entities;
using azadiyanChat.Domain.Interfaces;
using azadiyanChat.Infrastructure.Identity;

namespace azadiyanChat.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMapper _mapper;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public AuthService(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IUnitOfWork unitOfWork,
        IMapper mapper,
        IHttpContextAccessor httpContextAccessor)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _unitOfWork = unitOfWork;
        _mapper = mapper;
        _httpContextAccessor = httpContextAccessor;
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
        // Login is intentionally credential-only (email/username + password).
        // No device registration or device ownership checks are performed here.
        var identityUser = await _userManager.FindByEmailAsync(dto.Email)
                           ?? await _userManager.FindByNameAsync(dto.Email);
        if (identityUser == null)
        {
            return new AuthResultDto
            {
                Succeeded = false,
                Error = "Invalid email or password"
            };
        }

        var result = await _signInManager.CheckPasswordSignInAsync(
            identityUser, dto.Password, lockoutOnFailure: false);
        if (!result.Succeeded)
        {
            return new AuthResultDto
            {
                Succeeded = false,
                Error = "Invalid email or password"
            };
        }

        await _signInManager.SignInAsync(identityUser, isPersistent: true);

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
        var httpContext = _httpContextAccessor.HttpContext;
        var identityUserId = httpContext?.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        if (!string.IsNullOrWhiteSpace(identityUserId))
        {
            var domainUser = await _unitOfWork.Users.GetByIdentityIdAsync(identityUserId);
            if (domainUser != null)
            {
                await _unitOfWork.Users.UpdateOnlineStatusAsync(domainUser.Id, false);
                await _unitOfWork.SaveChangesAsync();
            }
        }

        try
        {
            await _signInManager.SignOutAsync();
        }
        catch
        {
            // Ignore and continue with explicit cookie cleanup below.
        }

        if (httpContext == null) return;

        await TrySignOutSchemeAsync(httpContext, IdentityConstants.ApplicationScheme);
        await TrySignOutSchemeAsync(httpContext, IdentityConstants.ExternalScheme);
        await TrySignOutSchemeAsync(httpContext, IdentityConstants.TwoFactorRememberMeScheme);
        await TrySignOutSchemeAsync(httpContext, IdentityConstants.TwoFactorUserIdScheme);
    }

    public async Task<UserDto?> GetCurrentUserAsync(string identityUserId)
    {
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityUserId);
        return user != null ? _mapper.Map<UserDto>(user) : null;
    }

    private static async Task TrySignOutSchemeAsync(HttpContext context, string scheme)
    {
        try
        {
            await context.SignOutAsync(scheme);
        }
        catch
        {
            // Some schemes may not be registered in specific hosting/test environments.
        }
    }
}
