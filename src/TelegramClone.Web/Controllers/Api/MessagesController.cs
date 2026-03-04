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

    private async Task<bool> IsUserInChatAsync(Guid chatId, Guid userId)
    {
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatId);
        return chat?.Participants.Any(p => p.UserId == userId) == true;
    }

    private async Task BroadcastToChatParticipantsAsync(Guid chatId, string eventName, object payload)
    {
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatId);
        if (chat == null || chat.Participants.Count == 0) return;

        var userGroups = chat.Participants
            .Select(p => $"user_{p.UserId}")
            .Distinct()
            .ToList();

        if (userGroups.Count == 0) return;

        await _hubContext.Clients.Groups(userGroups).SendAsync(eventName, payload);
    }

    [HttpGet]
    public async Task<IActionResult> GetMessages(Guid chatId, [FromQuery] int limit = 50, [FromQuery] DateTime? before = null)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();
        if (!await IsUserInChatAsync(chatId, userId.Value)) return Forbid();

        var messages = await _messageService.GetMessagesAsync(chatId, limit, before);
        return Ok(messages);
    }

    [HttpPost]
    public async Task<IActionResult> SendMessage(Guid chatId, [FromBody] SendMessageDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();
        if (!await IsUserInChatAsync(chatId, userId.Value)) return Forbid();

        MessageDto message;
        try
        {
            message = await _messageService.SendMessageAsync(chatId, userId.Value, dto);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }

        // Broadcast to all chat participants (works even if a new chat group was not joined yet)
        await BroadcastToChatParticipantsAsync(chatId, "ReceiveMessage", message);

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

        await BroadcastToChatParticipantsAsync(chatId, "ReactionUpdated", new
        {
            messageId = message.Id,
            reactions = message.Reactions
        });
        return Ok(message);
    }

    [HttpDelete("{id}/reactions/{emoji}")]
    public async Task<IActionResult> RemoveReaction(Guid chatId, Guid id, string emoji)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var result = await _messageService.RemoveReactionAsync(id, userId.Value, emoji);
        if (!result) return NotFound();

        await BroadcastToChatParticipantsAsync(chatId, "ReactionUpdated", new
        {
            messageId = id,
            emoji,
            userId = userId.Value,
            action = "remove"
        });
        return Ok();
    }

    [HttpPost("{id}/forward")]
    public async Task<IActionResult> ForwardMessage(Guid chatId, Guid id, [FromBody] ForwardRequest request)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();
        if (!await IsUserInChatAsync(request.TargetChatId, userId.Value)) return Forbid();

        var message = await _messageService.ForwardMessageAsync(id, request.TargetChatId, userId.Value);
        if (message == null) return NotFound();

        await BroadcastToChatParticipantsAsync(request.TargetChatId, "ReceiveMessage", message);
        return Ok(message);
    }
}

public record ForwardRequest(Guid TargetChatId);
