using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace azadiyanChat.IntegrationTests;

/// <summary>
/// CT-02: Verify envelope dedup. Submitting the same envelopeId twice
/// should result in the second being marked as "duplicate".
/// </summary>
public class EnvelopeDedupTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private readonly JsonSerializerOptions _jsonOptions;

    public EnvelopeDedupTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
        _jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    }

    [Fact]
    public async Task SubmitSameEnvelopeIdTwice_SecondIsDeduplicated()
    {
        // Arrange
        var services = _factory.Services;
        var (userId, identityId) = await TestHelpers.CreateTestUserAsync(
            services, $"dedup-{Guid.NewGuid():N}@test.com", "DedupUser");
        var deviceId = await TestHelpers.RegisterDeviceAsync(services, userId);

        var envelopeId = Guid.NewGuid();
        var body = new
        {
            senderDeviceId = deviceId,
            envelopes = new[]
            {
                new
                {
                    destinationUserId = Guid.NewGuid(),
                    destinationDeviceId = 1,
                    type = 1,
                    content = Convert.ToBase64String(new byte[] { 1, 2, 3 }),
                    envelopeId
                }
            }
        };

        _factory.TestIdentityUserId = identityId;
        var client = _factory.CreateClient();

        // Act: submit once
        var response1 = await client.PostAsJsonAsync("/api/envelopes", body, _jsonOptions);
        Assert.Equal(HttpStatusCode.OK, response1.StatusCode);

        var json1 = await response1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(1, json1.GetProperty("submitted").GetInt32());
        Assert.Equal("accepted", json1.GetProperty("results")[0].GetProperty("status").GetString());

        // Act: submit same envelopeId again
        var response2 = await client.PostAsJsonAsync("/api/envelopes", body, _jsonOptions);
        Assert.Equal(HttpStatusCode.OK, response2.StatusCode);

        var json2 = await response2.Content.ReadFromJsonAsync<JsonElement>();

        // Assert: second submission should be dedup'd
        Assert.Equal(0, json2.GetProperty("submitted").GetInt32());

        var result2 = json2.GetProperty("results")[0];
        Assert.Equal("duplicate", result2.GetProperty("status").GetString());
    }

    [Fact]
    public async Task SubmitDifferentEnvelopeIds_BothAccepted()
    {
        // Arrange
        var services = _factory.Services;
        var (userId, identityId) = await TestHelpers.CreateTestUserAsync(
            services, $"dedup2-{Guid.NewGuid():N}@test.com", "DedupUser2");
        var deviceId = await TestHelpers.RegisterDeviceAsync(services, userId);

        var body = new
        {
            senderDeviceId = deviceId,
            envelopes = new[]
            {
                new
                {
                    destinationUserId = Guid.NewGuid(),
                    destinationDeviceId = 1,
                    type = 1,
                    content = Convert.ToBase64String(new byte[] { 1, 2, 3 }),
                    envelopeId = Guid.NewGuid()
                },
                new
                {
                    destinationUserId = Guid.NewGuid(),
                    destinationDeviceId = 2,
                    type = 1,
                    content = Convert.ToBase64String(new byte[] { 4, 5, 6 }),
                    envelopeId = Guid.NewGuid()
                }
            }
        };

        _factory.TestIdentityUserId = identityId;
        var client = _factory.CreateClient();

        // Act
        var response = await client.PostAsJsonAsync("/api/envelopes", body, _jsonOptions);

        // Assert: both accepted
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, json.GetProperty("submitted").GetInt32());
    }
}
