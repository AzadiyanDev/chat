using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using System.Collections.Concurrent;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;

namespace TelegramClone.Web.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private static readonly ConcurrentDictionary<Guid, int> UserConnectionCounts = new();
    private static readonly ConcurrentDictionary<string, Guid> ConnectionUsers = new();

    private readonly IUnitOfWork _unitOfWork;
    private readonly IUserAppService _userService;

    public ChatHub(IUnitOfWork unitOfWork, IUserAppService userService)
    {
        _unitOfWork = unitOfWork;
        _userService = userService;
    }

    private async Task<Guid?> GetDomainUserIdAsync()
    {
        // Fast path: check in-memory cache first (avoids DB query on hot paths like typing)
        if (ConnectionUsers.TryGetValue(Context.ConnectionId, out var cached))
            return cached;

        var identityId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityId)) return null;
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityId);
        if (user != null)
            ConnectionUsers[Context.ConnectionId] = user.Id;
        return user?.Id;
    }

    /// <summary>
    /// Verify that the current user is a participant of the given chat.
    /// Uses a lightweight EXISTS query instead of loading the full Chat entity.
    /// </summary>
    private async Task<bool> IsUserInChatAsync(Guid userId, string chatId)
    {
        if (!Guid.TryParse(chatId, out var chatGuid)) return false;
        return await _unitOfWork.Chats.IsUserParticipantAsync(chatGuid, userId);
    }

    public override async Task OnConnectedAsync()
    {
        var userId = await GetDomainUserIdAsync();
        if (userId.HasValue)
        {
            ConnectionUsers[Context.ConnectionId] = userId.Value;
            var connectionCount = UserConnectionCounts.AddOrUpdate(userId.Value, 1, (_, current) => current + 1);

            if (connectionCount == 1)
            {
                await _userService.SetOnlineStatusAsync(userId.Value, true);
                await Clients.Others.SendAsync("UserOnline", userId.Value);
            }

            // Join all user's chat groups (lightweight: only fetches IDs)
            var chatIds = await _unitOfWork.Chats.GetUserChatIdsAsync(userId.Value);
            foreach (var chatId in chatIds)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, chatId.ToString());
            }

            // Register user connection for E2EE envelope notifications
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId.Value}");
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Guid? userId = null;
        if (ConnectionUsers.TryRemove(Context.ConnectionId, out var mappedUserId))
        {
            userId = mappedUserId;
        }
        else
        {
            userId = await GetDomainUserIdAsync();
        }

        if (userId.HasValue)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"user_{userId.Value}");

            var remainingConnections = UserConnectionCounts.AddOrUpdate(
                userId.Value,
                0,
                (_, current) => current > 0 ? current - 1 : 0
            );

            if (remainingConnections <= 0)
            {
                UserConnectionCounts.TryRemove(userId.Value, out _);
                await _userService.SetOnlineStatusAsync(userId.Value, false);
                await Clients.Others.SendAsync("UserOffline", userId.Value);
            }
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
    /// Leave a specific chat group — with membership verification.
    /// </summary>
    public async Task LeaveChat(string chatId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId == null) return;

        // Security: verify user is a participant of this chat before leaving the group
        if (!await IsUserInChatAsync(userId.Value, chatId)) return;

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
    /// Security: caller must share at least one chat with the target user.
    /// </summary>
    public async Task NotifyKeyChange(string targetUserId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId == null) return;

        // Security: verify caller shares at least one chat with the target user
        if (!Guid.TryParse(targetUserId, out var targetGuid)) return;
        if (!await _unitOfWork.Chats.ShareChatAsync(userId.Value, targetGuid)) return;

        await Clients.Group($"user_{targetUserId}").SendAsync("KeyBundleChanged", new
        {
            userId = userId.Value,
            timestamp = DateTime.UtcNow
        });
    }
}
