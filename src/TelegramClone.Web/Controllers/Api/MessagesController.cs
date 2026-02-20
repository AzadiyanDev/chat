using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Web.Hubs;

namespace TelegramClone.Web.Controllers.Api;

[ApiController]
[Route("api/chats/{chatId}/[controller]")]
[Authorize]
public class MessagesController : ControllerBase
{
    private readonly IMessageAppService _messageService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IHubContext<ChatHub> _hubContext;

    public MessagesController(IMessageAppService messageService, IUnitOfWork unitOfWork, IHubContext<ChatHub> hubContext)
    {
        _messageService = messageService;
        _unitOfWork = unitOfWork;
        _hubContext = hubContext;
    }

    private async Task<Guid?> GetCurrentDomainUserIdAsync()
    {
        var identityId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityId)) return null;
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityId);
        return user?.Id;
    }

    [HttpGet]
    public async Task<IActionResult> GetMessages(Guid chatId, [FromQuery] int limit = 50, [FromQuery] DateTime? before = null)
    {
        var messages = await _messageService.GetMessagesAsync(chatId, limit, before);
        return Ok(messages);
    }

    [HttpPost]
    public async Task<IActionResult> SendMessage(Guid chatId, [FromBody] SendMessageDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var message = await _messageService.SendMessageAsync(chatId, userId.Value, dto);

        // Broadcast via SignalR
        await _hubContext.Clients.Group(chatId.ToString()).SendAsync("ReceiveMessage", message);

        return Ok(message);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMessage(Guid chatId, Guid id)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _messageService.DeleteMessageAsync(id, userId.Value);
        if (!result) return NotFound();

        await _hubContext.Clients.Group(chatId.ToString()).SendAsync("MessageDeleted", id);
        return Ok();
    }

    [HttpPost("{id}/reactions")]
    public async Task<IActionResult> AddReaction(Guid chatId, Guid id, [FromBody] AddReactionDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var message = await _messageService.AddReactionAsync(id, userId.Value, dto.Emoji);
        if (message == null) return NotFound();

        await _hubContext.Clients.Group(chatId.ToString()).SendAsync("ReactionUpdated", message);
        return Ok(message);
    }

    [HttpDelete("{id}/reactions/{emoji}")]
    public async Task<IActionResult> RemoveReaction(Guid chatId, Guid id, string emoji)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _messageService.RemoveReactionAsync(id, userId.Value, emoji);
        if (!result) return NotFound();
        return Ok();
    }

    [HttpPost("{id}/forward")]
    public async Task<IActionResult> ForwardMessage(Guid chatId, Guid id, [FromBody] ForwardRequest request)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var message = await _messageService.ForwardMessageAsync(id, request.TargetChatId, userId.Value);
        if (message == null) return NotFound();

        await _hubContext.Clients.Group(request.TargetChatId.ToString()).SendAsync("ReceiveMessage", message);
        return Ok(message);
    }
}

public record ForwardRequest(Guid TargetChatId);
