using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Enums;
using TelegramClone.Infrastructure.Data;
using Xunit;

namespace TelegramClone.IntegrationTests;

public class MessageAtRestEncryptionTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private readonly JsonSerializerOptions _json;

    public MessageAtRestEncryptionTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
        _json = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new JsonStringEnumConverter() }
        };
    }

    [Fact]
    public async Task SendMessage_PersistsEncryptedChunks_AndNotPlaintext()
    {
        var services = _factory.Services;

        var (_, senderIdentityId) = await TestHelpers.CreateTestUserAsync(
            services, $"enc-a-{Guid.NewGuid():N}@test.com", "Sender");
        var (receiverUserId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"enc-b-{Guid.NewGuid():N}@test.com", "Receiver");

        _factory.TestIdentityUserId = senderIdentityId;
        var client = _factory.CreateClient();

        var createChatResponse = await client.PostAsJsonAsync("/api/chats", new CreateChatDto
        {
            Type = ChatType.Direct,
            ParticipantIds = new List<Guid> { receiverUserId }
        }, _json);

        Assert.Equal(HttpStatusCode.Created, createChatResponse.StatusCode);
        var chat = await createChatResponse.Content.ReadFromJsonAsync<ChatDto>(_json);
        Assert.NotNull(chat);

        var plaintext = "security check message - do not store this raw";
        var sendResponse = await client.PostAsJsonAsync($"/api/chats/{chat!.Id}/messages", new SendMessageDto
        {
            Text = plaintext
        }, _json);

        Assert.Equal(HttpStatusCode.OK, sendResponse.StatusCode);
        var sentMessage = await sendResponse.Content.ReadFromJsonAsync<MessageDto>(_json);
        Assert.NotNull(sentMessage);
        Assert.Equal(plaintext, sentMessage!.Text);

        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<TelegramDbContext>();
        var protector = scope.ServiceProvider.GetRequiredService<IMessageTextProtectionService>();

        var stored = await db.Messages
            .Include(m => m.TextChunks)
            .FirstOrDefaultAsync(m => m.Id == sentMessage.Id);

        Assert.NotNull(stored);
        Assert.Null(stored!.Text);
        Assert.NotEmpty(stored.TextChunks);

        var chunks = stored.TextChunks
            .Select(c => new MessageTextEncryptedChunk(c.ChunkIndex, c.Payload))
            .ToList();

        var decrypted = protector.Decrypt(
            stored.ChatId,
            stored.Id,
            chunks);

        Assert.Equal(plaintext, decrypted);
        Assert.ThrowsAny<CryptographicException>(() => protector.Decrypt(Guid.NewGuid(), stored.Id, chunks));
        Assert.ThrowsAny<CryptographicException>(() => protector.Decrypt(stored.ChatId, Guid.NewGuid(), chunks));

        var tamperedChunkIndexes = chunks
            .Select(c => c with { ChunkIndex = c.ChunkIndex + 1 })
            .ToList();

        Assert.ThrowsAny<CryptographicException>(() => protector.Decrypt(stored.ChatId, stored.Id, tamperedChunkIndexes));
    }
}
