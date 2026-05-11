using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using azadiyanChat.Application.DTOs;
using azadiyanChat.Domain.Enums;
using Xunit;

namespace azadiyanChat.IntegrationTests;

public class GroupMemberManagementTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private readonly JsonSerializerOptions _json;

    public GroupMemberManagementTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
        _json = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new JsonStringEnumConverter() }
        };
    }

    [Fact]
    public async Task Owner_CanListAddAndRemoveMembers()
    {
        var services = _factory.Services;
        var (ownerUserId, ownerIdentityId) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-owner-{Guid.NewGuid():N}@test.com", "Owner User");
        var (memberUserId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-member-{Guid.NewGuid():N}@test.com", "Member User");
        var (newUserId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-new-{Guid.NewGuid():N}@test.com", "New User");

        _factory.TestIdentityUserId = ownerIdentityId;
        var ownerClient = _factory.CreateClient();

        var createResponse = await ownerClient.PostAsJsonAsync("/api/chats", new CreateChatDto
        {
            Type = ChatType.Group,
            Name = "Team Room",
            ParticipantIds = new List<Guid> { memberUserId }
        }, _json);
        var chat = await createResponse.Content.ReadFromJsonAsync<ChatDto>(_json);

        var listBefore = await ownerClient.GetFromJsonAsync<JsonElement>($"/api/chats/{chat!.Id}/members");
        var beforeMembers = listBefore.GetProperty("members");
        Assert.True(listBefore.GetProperty("canManageMembers").GetBoolean());
        Assert.Equal(2, beforeMembers.GetArrayLength());

        var addResponse = await ownerClient.PostAsJsonAsync(
            $"/api/chats/{chat.Id}/members",
            new { userId = newUserId },
            _json);

        Assert.Equal(HttpStatusCode.OK, addResponse.StatusCode);
        var addedMember = await addResponse.Content.ReadFromJsonAsync<JsonElement>(_json);
        Assert.Equal(
            newUserId.ToString().ToLowerInvariant(),
            addedMember.GetProperty("id").GetString()?.ToLowerInvariant());

        var listAfterAdd = await ownerClient.GetFromJsonAsync<JsonElement>($"/api/chats/{chat.Id}/members");
        Assert.Equal(3, listAfterAdd.GetProperty("members").GetArrayLength());

        var removeResponse = await ownerClient.DeleteAsync($"/api/chats/{chat.Id}/members/{newUserId}");
        Assert.Equal(HttpStatusCode.NoContent, removeResponse.StatusCode);

        var listAfterRemove = await ownerClient.GetFromJsonAsync<JsonElement>($"/api/chats/{chat.Id}/members");
        var remaining = listAfterRemove.GetProperty("members").EnumerateArray()
            .Select(x => x.GetProperty("id").GetString())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        Assert.Equal(2, remaining.Count);
        Assert.DoesNotContain(remaining, id => string.Equals(id, newUserId.ToString(), StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task RegularMember_CannotAddOrRemoveMembers()
    {
        var services = _factory.Services;
        var (_, ownerIdentityId) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-ow2-{Guid.NewGuid():N}@test.com", "Owner User Two");
        var (memberUserId, memberIdentityId) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-mem2-{Guid.NewGuid():N}@test.com", "Member User Two");
        var (targetUserId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-target-{Guid.NewGuid():N}@test.com", "Target User");

        _factory.TestIdentityUserId = ownerIdentityId;
        var ownerClient = _factory.CreateClient();
        var createResponse = await ownerClient.PostAsJsonAsync("/api/chats", new CreateChatDto
        {
            Type = ChatType.Group,
            Name = "No Admin Group",
            ParticipantIds = new List<Guid> { memberUserId }
        }, _json);
        var chat = await createResponse.Content.ReadFromJsonAsync<ChatDto>(_json);

        _factory.TestIdentityUserId = memberIdentityId;
        var memberClient = _factory.CreateClient();

        var addResponse = await memberClient.PostAsJsonAsync(
            $"/api/chats/{chat!.Id}/members",
            new { userId = targetUserId },
            _json);
        Assert.Equal(HttpStatusCode.Forbidden, addResponse.StatusCode);

        var removeResponse = await memberClient.DeleteAsync($"/api/chats/{chat.Id}/members/{targetUserId}");
        Assert.Equal(HttpStatusCode.Forbidden, removeResponse.StatusCode);
    }

    [Fact]
    public async Task NonMember_CannotViewGroupMembers()
    {
        var services = _factory.Services;
        var (_, ownerIdentityId) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-ow3-{Guid.NewGuid():N}@test.com", "Owner User Three");
        var (memberUserId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-mem3-{Guid.NewGuid():N}@test.com", "Member User Three");
        var (_, outsiderIdentityId) = await TestHelpers.CreateTestUserAsync(
            services, $"grp-out-{Guid.NewGuid():N}@test.com", "Outsider User");

        _factory.TestIdentityUserId = ownerIdentityId;
        var ownerClient = _factory.CreateClient();
        var createResponse = await ownerClient.PostAsJsonAsync("/api/chats", new CreateChatDto
        {
            Type = ChatType.Group,
            Name = "Private Members Group",
            ParticipantIds = new List<Guid> { memberUserId }
        }, _json);
        var chat = await createResponse.Content.ReadFromJsonAsync<ChatDto>(_json);

        _factory.TestIdentityUserId = outsiderIdentityId;
        var outsiderClient = _factory.CreateClient();
        var membersResponse = await outsiderClient.GetAsync($"/api/chats/{chat!.Id}/members");

        Assert.Equal(HttpStatusCode.NotFound, membersResponse.StatusCode);
    }
}
