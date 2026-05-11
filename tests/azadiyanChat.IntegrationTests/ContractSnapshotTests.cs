using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace azadiyanChat.IntegrationTests;

/// <summary>
/// CT-03: Verify that the JSON contract shapes match the canonical DTO record property names.
/// These tests ensure client/server contract alignment and prevent silent regressions.
/// </summary>
public class ContractSnapshotTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private readonly JsonSerializerOptions _jsonOptions;

    public ContractSnapshotTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
        _jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    }

    [Fact]
    public async Task PostEnvelopes_RequestBody_MatchesContract()
    {
        // Arrange
        var (_, identityId, userId, deviceId) = await SeedAuthenticatedUser();

        var destinationUserId = Guid.NewGuid();

        var body = new
        {
            senderDeviceId = deviceId,
            envelopes = new[]
            {
                new
                {
                    destinationUserId,
                    destinationDeviceId = 1,
                    type = 1,
                    content = Convert.ToBase64String(new byte[] { 1, 2, 3 }),
                    envelopeId = Guid.NewGuid()
                }
            }
        };

        // Act: send the request, verify the server understands the shape
        var client = CreateAuthenticatedClient(identityId);
        var response = await client.PostAsJsonAsync("/api/envelopes", body, _jsonOptions);

        // Assert: 200 OK means the server deserialized the request correctly
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        // Response must have "submitted" (int) and "results" (array)
        Assert.True(json.TryGetProperty("submitted", out var submitted));
        Assert.Equal(JsonValueKind.Number, submitted.ValueKind);

        Assert.True(json.TryGetProperty("results", out var results));
        Assert.Equal(JsonValueKind.Array, results.ValueKind);
        Assert.True(results.GetArrayLength() >= 1);

        // Each result item must have: index, status
        var firstResult = results[0];
        Assert.True(firstResult.TryGetProperty("index", out _));
        Assert.True(firstResult.TryGetProperty("status", out _));
    }

    [Fact]
    public async Task GetOtpkCount_ResponseShape_HasAvailableField()
    {
        // Arrange
        var (services, identityId, userId, deviceId) = await SeedAuthenticatedUser();
        await TestHelpers.SeedKeyBundleAsync(services, userId, deviceId);
        await TestHelpers.SeedOneTimePreKeysAsync(services, userId, deviceId, 5);

        // Act
        var client = CreateAuthenticatedClient(identityId);
        var response = await client.GetAsync($"/api/keys/otpk-count/{deviceId}");

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        // Canonical field name is "available" (not "count")
        Assert.True(json.TryGetProperty("available", out var available),
            "Response must contain 'available' field (per E2EE contract)");
        Assert.Equal(5, available.GetInt32());
    }

    [Fact]
    public async Task PostEnvelopes_PerItemResult_ContainsEnvelopeFields()
    {
        // Verify the per-item result shape for accepted envelopes
        var (_, identityId, userId, deviceId) = await SeedAuthenticatedUser();

        var envelopeId = Guid.NewGuid();
        var body = new
        {
            senderDeviceId = deviceId,
            envelopes = new[]
            {
                new
                {
                    destinationUserId = Guid.NewGuid(),
                    destinationDeviceId = 99,
                    type = 1,
                    content = Convert.ToBase64String(new byte[] { 1, 2, 3 }),
                    envelopeId
                }
            }
        };

        var client = CreateAuthenticatedClient(identityId);
        var response = await client.PostAsJsonAsync("/api/envelopes", body, _jsonOptions);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();

        var result = json.GetProperty("results")[0];
        Assert.Equal(0, result.GetProperty("index").GetInt32());
        // Status should be "accepted" (envelope is valid even if destination doesn't exist)
        Assert.Equal("accepted", result.GetProperty("status").GetString());
    }

    // ── Helpers ──

    private async Task<(IServiceProvider Services, string IdentityId, Guid UserId, int DeviceId)>
        SeedAuthenticatedUser()
    {
        var services = _factory.Services;
        var (userId, identityId) = await TestHelpers.CreateTestUserAsync(
            services, $"contract-{Guid.NewGuid():N}@test.com", "ContractUser");
        var deviceId = await TestHelpers.RegisterDeviceAsync(services, userId);
        return (services, identityId, userId, deviceId);
    }

    private HttpClient CreateAuthenticatedClient(string identityUserId)
    {
        _factory.TestIdentityUserId = identityUserId;
        return _factory.CreateClient();
    }
}
