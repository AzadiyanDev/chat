using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using azadiyanChat.Application.DTOs;
using azadiyanChat.Domain.Enums;
using Xunit;

namespace azadiyanChat.IntegrationTests;

/// <summary>
/// Integration tests for Group Chat creation (GRP-01..04) and Forward (FWD) membership checks.
/// </summary>
public class GroupChatAndForwardTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private readonly JsonSerializerOptions _json;

    public GroupChatAndForwardTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
        _json = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new JsonStringEnumConverter() }
        };
    }

    // ───────────────────────────────────────────
    //  GRP-01: Create a group chat via API
    // ───────────────────────────────────────────

    [Fact]
    public async Task CreateGroupChat_ReturnsGroupWithAllParticipants()
    {
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"grpA-{Guid.NewGuid():N}@test.com", "Alice");
        var (userBId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grpB-{Guid.NewGuid():N}@test.com", "Bob");
        var (userCId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grpC-{Guid.NewGuid():N}@test.com", "Charlie");

        _factory.TestIdentityUserId = identityA;
        var client = _factory.CreateClient();

        var body = new CreateChatDto
        {
            Type = ChatType.Group,
            Name = "Test Group",
            ParticipantIds = new List<Guid> { userBId, userCId }
        };

        var response = await client.PostAsJsonAsync("/api/chats", body, _json);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var chat = await response.Content.ReadFromJsonAsync<ChatDto>(_json);
        Assert.NotNull(chat);
        Assert.Equal(ChatType.Group, chat!.Type);
        Assert.Equal("Test Group", chat.Name);
        // Creator + 2 participants
        Assert.Equal(3, chat.Participants.Count);
    }

    // ───────────────────────────────────────────
    //  GRP-04: Non-member cannot read group messages
    // ───────────────────────────────────────────

    [Fact]
    public async Task GetMessages_AsNonMember_ReturnsForbid()
    {
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"grpMemA-{Guid.NewGuid():N}@test.com", "Alice");
        var (userBId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grpMemB-{Guid.NewGuid():N}@test.com", "Bob");
        var (_, identityC) = await TestHelpers.CreateTestUserAsync(
            services, $"grpMemC-{Guid.NewGuid():N}@test.com", "Charlie");

        // Alice creates a group with Bob only
        _factory.TestIdentityUserId = identityA;
        var clientA = _factory.CreateClient();
        var createBody = new CreateChatDto
        {
            Type = ChatType.Group,
            Name = "Private Group",
            ParticipantIds = new List<Guid> { userBId }
        };
        var createResp = await clientA.PostAsJsonAsync("/api/chats", createBody, _json);
        var chat = await createResp.Content.ReadFromJsonAsync<ChatDto>(_json);

        // Charlie (not a member) tries to read messages
        _factory.TestIdentityUserId = identityC;
        var clientC = _factory.CreateClient();
        var response = await clientC.GetAsync($"/api/chats/{chat!.Id}/messages");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ───────────────────────────────────────────
    //  GRP-04: Non-member cannot send to group
    // ───────────────────────────────────────────

    [Fact]
    public async Task SendMessage_AsNonMember_ReturnsForbid()
    {
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"grpSndA-{Guid.NewGuid():N}@test.com", "AliceSnd");
        var (userBId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grpSndB-{Guid.NewGuid():N}@test.com", "BobSnd");
        var (_, identityC) = await TestHelpers.CreateTestUserAsync(
            services, $"grpSndC-{Guid.NewGuid():N}@test.com", "CharlieSnd");

        _factory.TestIdentityUserId = identityA;
        var clientA = _factory.CreateClient();
        var createResp = await clientA.PostAsJsonAsync("/api/chats", new CreateChatDto
        {
            Type = ChatType.Group,
            Name = "No Send Group",
            ParticipantIds = new List<Guid> { userBId }
        }, _json);
        var chat = await createResp.Content.ReadFromJsonAsync<ChatDto>(_json);

        // Charlie tries to send
        _factory.TestIdentityUserId = identityC;
        var clientC = _factory.CreateClient();
        var msgBody = new { text = "Hello sneaky!" };
        var response = await clientC.PostAsJsonAsync($"/api/chats/{chat!.Id}/messages", msgBody, _json);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ───────────────────────────────────────────
    //  GRP-04: Non-member cannot view chat details
    // ───────────────────────────────────────────

    [Fact]
    public async Task GetChat_AsNonMember_ReturnsNotFound()
    {
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"grpDetA-{Guid.NewGuid():N}@test.com", "AliceDet");
        var (userBId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grpDetB-{Guid.NewGuid():N}@test.com", "BobDet");
        var (_, identityC) = await TestHelpers.CreateTestUserAsync(
            services, $"grpDetC-{Guid.NewGuid():N}@test.com", "CharlieDet");

        _factory.TestIdentityUserId = identityA;
        var clientA = _factory.CreateClient();
        var createResp = await clientA.PostAsJsonAsync("/api/chats", new CreateChatDto
        {
            Type = ChatType.Group,
            Name = "Secret Group",
            ParticipantIds = new List<Guid> { userBId }
        }, _json);
        var chat = await createResp.Content.ReadFromJsonAsync<ChatDto>(_json);

        // Charlie tries to view chat details
        _factory.TestIdentityUserId = identityC;
        var clientC = _factory.CreateClient();
        var response = await clientC.GetAsync($"/api/chats/{chat!.Id}");

        // GetChatByIdAsync returns null for non-members → controller returns 404
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ───────────────────────────────────────────
    //  Member can read messages
    // ───────────────────────────────────────────

    [Fact]
    public async Task GetMessages_AsMember_ReturnsOk()
    {
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"grpOkA-{Guid.NewGuid():N}@test.com", "AliceOk");
        var (userBId, identityB) = await TestHelpers.CreateTestUserAsync(
            services, $"grpOkB-{Guid.NewGuid():N}@test.com", "BobOk");

        _factory.TestIdentityUserId = identityA;
        var clientA = _factory.CreateClient();
        var createResp = await clientA.PostAsJsonAsync("/api/chats", new CreateChatDto
        {
            Type = ChatType.Group,
            Name = "Open Group",
            ParticipantIds = new List<Guid> { userBId }
        }, _json);
        var chat = await createResp.Content.ReadFromJsonAsync<ChatDto>(_json);

        // Bob (a member) reads messages
        _factory.TestIdentityUserId = identityB;
        var clientB = _factory.CreateClient();
        var response = await clientB.GetAsync($"/api/chats/{chat!.Id}/messages");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
