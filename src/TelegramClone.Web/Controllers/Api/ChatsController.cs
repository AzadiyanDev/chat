using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Identity;

namespace TelegramClone.Web.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ChatsController : ControllerBase
{
    private readonly IChatAppService _chatService;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IUnitOfWork _unitOfWork;

    public ChatsController(IChatAppService chatService, UserManager<ApplicationUser> userManager, IUnitOfWork unitOfWork)
    {
        _chatService = chatService;
        _userManager = userManager;
        _unitOfWork = unitOfWork;
    }

    private async Task<Guid?> GetCurrentDomainUserIdAsync()
    {
        var identityId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityId)) return null;
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityId);
        return user?.Id;
    }

    [HttpGet]
    public async Task<IActionResult> GetChats()
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var chats = await _chatService.GetUserChatsAsync(userId.Value);
        return Ok(chats);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetChat(Guid id)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var chat = await _chatService.GetChatByIdAsync(id, userId.Value);
        if (chat == null) return NotFound();
        return Ok(chat);
    }

    [HttpPost]
    public async Task<IActionResult> CreateChat([FromBody] CreateChatDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var chat = await _chatService.CreateChatAsync(dto, userId.Value);
        return CreatedAtAction(nameof(GetChat), new { id = chat.Id }, chat);
    }

    [HttpPut("{id}/pin")]
    public async Task<IActionResult> PinChat(Guid id, [FromBody] PinChatRequest request)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _chatService.PinChatAsync(id, userId.Value, request.IsPinned);
        if (!result) return NotFound();
        return Ok();
    }

    [HttpGet("search")]
    public async Task<IActionResult> SearchChats([FromQuery] string q)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var chats = await _chatService.SearchChatsAsync(userId.Value, q);
        return Ok(chats);
    }
}

public record PinChatRequest(bool IsPinned);
