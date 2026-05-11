using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using azadiyanChat.Application.DTOs;
using azadiyanChat.Application.Interfaces;
using azadiyanChat.Domain.Interfaces;
using azadiyanChat.Infrastructure.Identity;

namespace azadiyanChat.Web.Controllers.Api;

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

    [HttpGet("saved")]
    public async Task<IActionResult> GetSavedMessages()
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var chat = await _chatService.GetOrCreateSavedMessagesAsync(userId.Value);
        return Ok(chat);
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

    [HttpPost("{id}/read")]
    public async Task<IActionResult> MarkAsRead(Guid id)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _chatService.MarkChatAsReadAsync(id, userId.Value);
        if (!result) return NotFound();
        return NoContent();
    }

    [HttpGet("{id}/members")]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var members = await _chatService.GetChatMembersAsync(id, userId.Value);
        if (members == null) return NotFound();
        return Ok(members);
    }

    [HttpPost("{id}/members")]
    public async Task<IActionResult> AddMember(Guid id, [FromBody] AddChatMemberRequest request)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _chatService.AddChatMemberAsync(id, userId.Value, request.UserId);
        return result.Status switch
        {
            ChatMemberMutationStatus.Success => Ok(result.Member),
            ChatMemberMutationStatus.ChatNotFound => NotFound(),
            ChatMemberMutationStatus.UserNotFound => NotFound(),
            ChatMemberMutationStatus.Forbidden => Forbid(),
            ChatMemberMutationStatus.InvalidChatType => BadRequest("Members can only be managed in group chats."),
            ChatMemberMutationStatus.AlreadyMember => Conflict("User is already a member of this group."),
            _ => BadRequest()
        };
    }

    [HttpDelete("{id}/members/{memberUserId}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid memberUserId)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _chatService.RemoveChatMemberAsync(id, userId.Value, memberUserId);
        return result.Status switch
        {
            ChatMemberMutationStatus.Success => NoContent(),
            ChatMemberMutationStatus.ChatNotFound => NotFound(),
            ChatMemberMutationStatus.NotMember => NotFound(),
            ChatMemberMutationStatus.Forbidden => Forbid(),
            ChatMemberMutationStatus.InvalidChatType => BadRequest("Members can only be managed in group chats."),
            ChatMemberMutationStatus.CannotRemoveOwner => BadRequest("Group owner cannot be removed."),
            ChatMemberMutationStatus.CannotRemoveSelf => BadRequest("You cannot remove yourself from the group."),
            _ => BadRequest()
        };
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
public record AddChatMemberRequest(Guid UserId);
