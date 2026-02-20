using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Web.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly IUserAppService _userService;
    private readonly IUnitOfWork _unitOfWork;

    public UsersController(IUserAppService userService, IUnitOfWork unitOfWork)
    {
        _userService = userService;
        _unitOfWork = unitOfWork;
    }

    private async Task<Guid?> GetCurrentDomainUserIdAsync()
    {
        var identityId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityId)) return null;
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityId);
        return user?.Id;
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchUsers([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
            return Ok(Array.Empty<object>());

        var currentUserId = await GetCurrentDomainUserIdAsync();
        var users = await _userService.SearchUsersAsync(q.Trim());

        // Filter out the current user from results
        if (currentUserId.HasValue)
            users = users.Where(u => u.Id != currentUserId.Value).ToList();

        return Ok(users);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetUser(Guid id)
    {
        var user = await _userService.GetUserByIdAsync(id);
        if (user == null) return NotFound();
        return Ok(user);
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var user = await _userService.UpdateProfileAsync(userId.Value, dto);
        if (user == null) return NotFound();
        return Ok(user);
    }
}
