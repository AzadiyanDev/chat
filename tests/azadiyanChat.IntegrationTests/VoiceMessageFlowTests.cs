using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using azadiyanChat.Application.DTOs;
using azadiyanChat.Domain.Enums;
using Xunit;

namespace azadiyanChat.IntegrationTests;

public class VoiceMessageFlowTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private readonly JsonSerializerOptions _json;

    public VoiceMessageFlowTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
        _json = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new JsonStringEnumConverter() }
        };
    }

    [Fact]
    public async Task UploadVoice_AllowsCodecParameterizedMediaType()
    {
        var (_, identityUserId) = await TestHelpers.CreateTestUserAsync(
            _factory.Services, $"voice-up-{Guid.NewGuid():N}@test.com", "Voice Upload");

        _factory.TestIdentityUserId = identityUserId;
        var client = _factory.CreateClient();

        var payload = new byte[] { 0x1A, 0x45, 0xDF, 0xA3, 0x42, 0x86, 0x81, 0x01 };
        using var multipart = new MultipartFormDataContent();
        using var content = new ByteArrayContent(payload);
        content.Headers.ContentType = MediaTypeHeaderValue.Parse("audio/webm; codecs=opus");
        multipart.Add(content, "file", "voice-test.webm");

        var response = await client.PostAsync("/api/files/voice", multipart);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(_json);
        var url = json.GetProperty("url").GetString();
        Assert.False(string.IsNullOrWhiteSpace(url));
        Assert.StartsWith("/uploads/voices/", url!, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task SendVoiceOnlyMessage_ReturnsVoicePayload_AndIsReadableByParticipant()
    {
        var (_, senderIdentityId) = await TestHelpers.CreateTestUserAsync(
            _factory.Services, $"voice-s-{Guid.NewGuid():N}@test.com", "Voice Sender");
        var (receiverUserId, receiverIdentityId) = await TestHelpers.CreateTestUserAsync(
            _factory.Services, $"voice-r-{Guid.NewGuid():N}@test.com", "Voice Receiver");

        _factory.TestIdentityUserId = senderIdentityId;
        var senderClient = _factory.CreateClient();

        var createResponse = await senderClient.PostAsJsonAsync("/api/chats", new CreateChatDto
        {
            Type = ChatType.Direct,
            ParticipantIds = new List<Guid> { receiverUserId }
        }, _json);
        var chat = await createResponse.Content.ReadFromJsonAsync<ChatDto>(_json);

        var sendResponse = await senderClient.PostAsJsonAsync($"/api/chats/{chat!.Id}/messages", new
        {
            voice = new
            {
                url = "/uploads/voices/fake_voice.webm",
                duration = 2.1,
                durationMs = 2100,
                waveform = new[] { 0.2, 0.5, 0.9 }
            }
        }, _json);

        Assert.Equal(HttpStatusCode.OK, sendResponse.StatusCode);
        var sent = await sendResponse.Content.ReadFromJsonAsync<JsonElement>(_json);
        Assert.True(sent.TryGetProperty("voice", out var voice));
        Assert.Equal("/uploads/voices/fake_voice.webm", voice.GetProperty("url").GetString());

        _factory.TestIdentityUserId = receiverIdentityId;
        var receiverClient = _factory.CreateClient();
        var listResponse = await receiverClient.GetAsync($"/api/chats/{chat.Id}/messages");

        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var messages = await listResponse.Content.ReadFromJsonAsync<List<JsonElement>>(_json);
        Assert.NotNull(messages);
        Assert.Contains(messages!, m =>
            m.TryGetProperty("voice", out var v)
            && string.Equals(v.GetProperty("url").GetString(), "/uploads/voices/fake_voice.webm", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task SendVoice_WithInvalidUrl_ReturnsBadRequest()
    {
        var (_, senderIdentityId) = await TestHelpers.CreateTestUserAsync(
            _factory.Services, $"voice-bad-{Guid.NewGuid():N}@test.com", "Voice Invalid Sender");

        _factory.TestIdentityUserId = senderIdentityId;
        var client = _factory.CreateClient();

        var chat = await client.GetFromJsonAsync<ChatDto>("/api/chats/saved", _json);

        var sendResponse = await client.PostAsJsonAsync($"/api/chats/{chat!.Id}/messages", new
        {
            voice = new
            {
                url = "https://example.com/voice.webm",
                duration = 1.2,
                durationMs = 1200,
                waveform = new[] { 0.3, 0.6 }
            }
        }, _json);

        Assert.Equal(HttpStatusCode.BadRequest, sendResponse.StatusCode);
    }
}
