using Microsoft.AspNetCore.Mvc;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Infrastructure.Identity;
using Microsoft.AspNetCore.Identity;
using System.Security.Claims;

namespace TelegramClone.Web.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly UserManager<ApplicationUser> _userManager;

    public AuthController(IAuthService authService, UserManager<ApplicationUser> userManager)
    {
        _authService = authService;
        _userManager = userManager;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        var result = await _authService.RegisterAsync(dto);
        if (!result.Succeeded)
            return BadRequest(new { error = result.Error });
        return Ok(result);
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] AuthDto dto)
    {
        var result = await _authService.LoginAsync(dto);
        if (!result.Succeeded)
            return Unauthorized(new { error = result.Error });
        return Ok(result);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await _authService.LogoutAsync();
        return Ok();
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetCurrentUser()
    {
        var identityUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityUserId))
            return Unauthorized();

        var user = await _authService.GetCurrentUserAsync(identityUserId);
        if (user == null) return NotFound();
        return Ok(user);
    }
}
