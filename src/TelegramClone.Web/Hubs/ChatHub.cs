using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Web.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IUserAppService _userService;

    public ChatHub(IUnitOfWork unitOfWork, IUserAppService userService)
    {
        _unitOfWork = unitOfWork;
        _userService = userService;
    }

    private async Task<Guid?> GetDomainUserIdAsync()
    {
        var identityId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityId)) return null;
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityId);
        return user?.Id;
    }

    /// <summary>
    /// Verify that the current user is a participant of the given chat.
    /// </summary>
    private async Task<bool> IsUserInChatAsync(Guid userId, string chatId)
    {
        if (!Guid.TryParse(chatId, out var chatGuid)) return false;
        var chat = await _unitOfWork.Chats.GetChatWithParticipantsAsync(chatGuid);
        return chat?.Participants.Any(p => p.UserId == userId) ?? false;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = await GetDomainUserIdAsync();
        if (userId.HasValue)
        {
            await _userService.SetOnlineStatusAsync(userId.Value, true);

            // Join all user's chat groups
            var chats = await _unitOfWork.Chats.GetUserChatsAsync(userId.Value);
            foreach (var chat in chats)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, chat.Id.ToString());
            }

            // Register user connection for E2EE envelope notifications
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId.Value}");

            // Notify others
            await Clients.Others.SendAsync("UserOnline", userId.Value);
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId.HasValue)
        {
            await _userService.SetOnlineStatusAsync(userId.Value, false);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user_{userId.Value}");
            await Clients.Others.SendAsync("UserOffline", userId.Value);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Join a specific chat group — with membership verification.
    /// </summary>
    public async Task JoinChat(string chatId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId == null) return;

        // Security: verify user is a participant of this chat
        if (!await IsUserInChatAsync(userId.Value, chatId)) return;

        await Groups.AddToGroupAsync(Context.ConnectionId, chatId);
    }

    /// <summary>
    /// Leave a specific chat group.
    /// </summary>
    public async Task LeaveChat(string chatId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, chatId);
    }

    /// <summary>
    /// Broadcast typing indicator to a chat — with membership verification.
    /// </summary>
    public async Task StartTyping(string chatId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId == null) return;

        if (!await IsUserInChatAsync(userId.Value, chatId)) return;
        await Clients.OthersInGroup(chatId).SendAsync("UserTyping", chatId, userId.Value);
    }

    /// <summary>
    /// Stop typing indicator — with membership verification.
    /// </summary>
    public async Task StopTyping(string chatId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId == null) return;

        if (!await IsUserInChatAsync(userId.Value, chatId)) return;
        await Clients.OthersInGroup(chatId).SendAsync("UserStoppedTyping", chatId, userId.Value);
    }

    /// <summary>
    /// Mark messages as delivered — with membership verification.
    /// </summary>
    public async Task MessageDelivered(string chatId, string messageId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId == null) return;

        if (!await IsUserInChatAsync(userId.Value, chatId)) return;
        await Clients.OthersInGroup(chatId).SendAsync("MessageStatusChanged", messageId, "Delivered");
    }

    /// <summary>
    /// Mark messages as seen — with membership verification.
    /// </summary>
    public async Task MessageSeen(string chatId, string messageId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId == null) return;

        if (!await IsUserInChatAsync(userId.Value, chatId)) return;
        await Clients.OthersInGroup(chatId).SendAsync("MessageStatusChanged", messageId, "Seen");
    }

    // ──── E2EE Notifications ────

    /// <summary>
    /// Notify a user that their key bundle has changed (e.g., key rotation, new device).
    /// Contacts should re-verify safety numbers.
    /// </summary>
    public async Task NotifyKeyChange(string targetUserId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId == null) return;

        await Clients.Group($"user_{targetUserId}").SendAsync("KeyBundleChanged", new
        {
            userId = userId.Value,
            timestamp = DateTime.UtcNow
        });
    }
}
