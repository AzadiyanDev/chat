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
            await Clients.Others.SendAsync("UserOffline", userId.Value);
        }

        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Join a specific chat group (e.g., when navigating to a chat).
    /// </summary>
    public async Task JoinChat(string chatId)
    {
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
    /// Broadcast typing indicator to a chat.
    /// </summary>
    public async Task StartTyping(string chatId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId.HasValue)
        {
            await Clients.OthersInGroup(chatId).SendAsync("UserTyping", chatId, userId.Value);
        }
    }

    /// <summary>
    /// Stop typing indicator.
    /// </summary>
    public async Task StopTyping(string chatId)
    {
        var userId = await GetDomainUserIdAsync();
        if (userId.HasValue)
        {
            await Clients.OthersInGroup(chatId).SendAsync("UserStoppedTyping", chatId, userId.Value);
        }
    }

    /// <summary>
    /// Mark messages as delivered.
    /// </summary>
    public async Task MessageDelivered(string chatId, string messageId)
    {
        await Clients.OthersInGroup(chatId).SendAsync("MessageStatusChanged", messageId, "Delivered");
    }

    /// <summary>
    /// Mark messages as seen.
    /// </summary>
    public async Task MessageSeen(string chatId, string messageId)
    {
        await Clients.OthersInGroup(chatId).SendAsync("MessageStatusChanged", messageId, "Seen");
    }
}
