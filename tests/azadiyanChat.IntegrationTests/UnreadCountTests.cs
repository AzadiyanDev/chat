using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using azadiyanChat.Application.DTOs;
using azadiyanChat.Application.Interfaces;
using azadiyanChat.Domain.Enums;
using azadiyanChat.Infrastructure.Data;
using Xunit;

namespace azadiyanChat.IntegrationTests;

/// <summary>
/// CT-06: Verify unread-count calculation and read acknowledgement flow.
/// </summary>
public class UnreadCountTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public UnreadCountTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetChats_ReturnsUnreadCount_AndReadEndpointClearsIt()
    {
        // Arrange users
        var services = _factory.Services;
        var (senderUserId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"unread-sender-{Guid.NewGuid():N}@test.com", "UnreadSender");
        var (receiverUserId, receiverIdentityId) = await TestHelpers.CreateTestUserAsync(
            services, $"unread-receiver-{Guid.NewGuid():N}@test.com", "UnreadReceiver");

        Guid chatId;
        await using (var scope = services.CreateAsyncScope())
        {
            var chatService = scope.ServiceProvider.GetRequiredService<IChatAppService>();
            var messageService = scope.ServiceProvider.GetRequiredService<IMessageAppService>();
            var db = scope.ServiceProvider.GetRequiredService<azadiyanChatDbContext>();

            var created = await chatService.CreateChatAsync(new CreateChatDto
            {
                Type = ChatType.Direct,
                ParticipantIds = new List<Guid> { receiverUserId }
            }, senderUserId);
            chatId = created.Id;

            // Move read-cursor to the past so the new message becomes unread.
            var receiverParticipant = await db.ChatParticipants
                .FirstAsync(p => p.ChatId == chatId && p.UserId == receiverUserId);
            receiverParticipant.LastReadAt = DateTime.UtcNow.AddMinutes(-10);
            await db.SaveChangesAsync();

            await messageService.SendMessageAsync(chatId, senderUserId, new SendMessageDto
            {
                Text = "New unread message"
            });
        }

        _factory.TestIdentityUserId = receiverIdentityId;
        var client = _factory.CreateClient();

        // Act 1: list chats before marking as read
        var listBeforeRead = await client.GetFromJsonAsync<List<JsonElement>>("/api/chats");

        // Assert 1
        Assert.NotNull(listBeforeRead);
        var chatBeforeRead = listBeforeRead!
            .First(c => string.Equals(c.GetProperty("id").GetString(), chatId.ToString(), StringComparison.OrdinalIgnoreCase));
        Assert.Equal(1, chatBeforeRead.GetProperty("unreadCount").GetInt32());

        // Act 2: mark as read
        var markReadResponse = await client.PostAsync($"/api/chats/{chatId}/read", content: null);

        // Assert 2
        Assert.Equal(HttpStatusCode.NoContent, markReadResponse.StatusCode);

        // Act 3: list chats again
        var listAfterRead = await client.GetFromJsonAsync<List<JsonElement>>("/api/chats");

        // Assert 3
        Assert.NotNull(listAfterRead);
        var chatAfterRead = listAfterRead!
            .First(c => string.Equals(c.GetProperty("id").GetString(), chatId.ToString(), StringComparison.OrdinalIgnoreCase));
        Assert.Equal(0, chatAfterRead.GetProperty("unreadCount").GetInt32());
    }
}
