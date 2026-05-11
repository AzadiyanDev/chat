using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace azadiyanChat.IntegrationTests;

/// <summary>
/// CT-04: Verify that endpoints reject requests where the deviceId
/// does not belong to the authenticated user (403 Forbidden).
/// </summary>
public class DeviceOwnershipTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    private readonly JsonSerializerOptions _jsonOptions;

    public DeviceOwnershipTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
        _jsonOptions = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
    }

    [Fact]
    public async Task SubmitEnvelopes_WithStolenDeviceId_Returns403()
    {
        // Arrange: create user A with device 1, create user B
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"ownerA-{Guid.NewGuid():N}@test.com", "UserA");
        var deviceA = await TestHelpers.RegisterDeviceAsync(services, userAId);

        var (userBId, identityB) = await TestHelpers.CreateTestUserAsync(
            services, $"ownerB-{Guid.NewGuid():N}@test.com", "UserB");

        // Act: User B tries to submit envelopes claiming to be from User A's device
        var body = new
        {
            senderDeviceId = deviceA, // <- belongs to User A, not User B
            envelopes = new[]
            {
                new
                {
                    destinationUserId = userAId,
                    destinationDeviceId = deviceA,
                    type = 1,
                    content = Convert.ToBase64String(new byte[] { 1, 2, 3 }),
                    envelopeId = Guid.NewGuid()
                }
            }
        };

        _factory.TestIdentityUserId = identityB;
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/envelopes", body, _jsonOptions);

        // Assert: 403 because device doesn't belong to User B
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task FetchQueued_WithStolenDeviceId_Returns403()
    {
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"fetchA-{Guid.NewGuid():N}@test.com", "FetchUserA");
        var deviceA = await TestHelpers.RegisterDeviceAsync(services, userAId);

        var (_, identityB) = await TestHelpers.CreateTestUserAsync(
            services, $"fetchB-{Guid.NewGuid():N}@test.com", "FetchUserB");

        // User B tries to fetch User A's device queue
        _factory.TestIdentityUserId = identityB;
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/envelopes/{deviceA}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AcknowledgeEnvelopes_WithStolenDeviceId_Returns403()
    {
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"ackA-{Guid.NewGuid():N}@test.com", "AckUserA");
        var deviceA = await TestHelpers.RegisterDeviceAsync(services, userAId);

        var (_, identityB) = await TestHelpers.CreateTestUserAsync(
            services, $"ackB-{Guid.NewGuid():N}@test.com", "AckUserB");

        // User B tries to acknowledge envelopes on User A's device
        _factory.TestIdentityUserId = identityB;
        var client = _factory.CreateClient();
        var ackBody = new { envelopeIds = new[] { Guid.NewGuid() } };
        var response = await client.PostAsJsonAsync($"/api/envelopes/ack/{deviceA}", ackBody, _jsonOptions);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task GetOtpkCount_WithStolenDeviceId_Returns403()
    {
        var services = _factory.Services;

        var (userAId, identityA) = await TestHelpers.CreateTestUserAsync(
            services, $"otpkA-{Guid.NewGuid():N}@test.com", "OtpkUserA");
        var deviceA = await TestHelpers.RegisterDeviceAsync(services, userAId);
        await TestHelpers.SeedKeyBundleAsync(services, userAId, deviceA);

        var (_, identityB) = await TestHelpers.CreateTestUserAsync(
            services, $"otpkB-{Guid.NewGuid():N}@test.com", "OtpkUserB");

        // User B tries to check OTPK count for User A's device
        _factory.TestIdentityUserId = identityB;
        var client = _factory.CreateClient();
        var response = await client.GetAsync($"/api/keys/otpk-count/{deviceA}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task UploadBundle_WithStolenDeviceId_Returns403()
    {
        var services = _factory.Services;

        var (userAId, _) = await TestHelpers.CreateTestUserAsync(
            services, $"bundleA-{Guid.NewGuid():N}@test.com", "BundleUserA");
        var deviceA = await TestHelpers.RegisterDeviceAsync(services, userAId);

        var (_, identityB) = await TestHelpers.CreateTestUserAsync(
            services, $"bundleB-{Guid.NewGuid():N}@test.com", "BundleUserB");

        // User B tries to upload a key bundle to User A's device
        var bundleBody = new
        {
            registrationId = 123,
            identityPublicKey = Convert.ToBase64String(new byte[33]),
            signedPreKey = new
            {
                keyId = 1,
                publicKey = Convert.ToBase64String(new byte[33]),
                signature = Convert.ToBase64String(new byte[64])
            },
            oneTimePreKeys = Array.Empty<object>()
        };

        _factory.TestIdentityUserId = identityB;
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync($"/api/keys/bundle/{deviceA}", bundleBody, _jsonOptions);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
