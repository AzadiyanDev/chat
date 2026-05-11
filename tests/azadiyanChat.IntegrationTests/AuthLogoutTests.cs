using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using azadiyanChat.Infrastructure.Data;
using Xunit;

namespace azadiyanChat.IntegrationTests;

/// <summary>
/// CT-05: Verify backend logout behavior.
/// </summary>
public class AuthLogoutTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;

    public AuthLogoutTests(TestWebApplicationFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Logout_AuthenticatedUser_MarksUserOffline()
    {
        // Arrange
        var (domainUserId, identityUserId) = await TestHelpers.CreateTestUserAsync(
            _factory.Services, $"logout-{Guid.NewGuid():N}@test.com", "LogoutUser");

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<azadiyanChatDbContext>();
            var user = await db.DomainUsers.FirstAsync(u => u.Id == domainUserId);
            user.IsOnline = true;
            user.LastSeen = null;
            await db.SaveChangesAsync();
        }

        _factory.TestIdentityUserId = identityUserId;
        var client = _factory.CreateClient();

        // Act
        var response = await client.PostAsync("/api/auth/logout", content: null);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using var verifyScope = _factory.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<azadiyanChatDbContext>();
        var reloadedUser = await verifyDb.DomainUsers.AsNoTracking().FirstAsync(u => u.Id == domainUserId);

        Assert.False(reloadedUser.IsOnline);
        Assert.NotNull(reloadedUser.LastSeen);
    }

    [Fact]
    public async Task Logout_WithoutAuthentication_Returns401()
    {
        // Arrange
        _factory.TestIdentityUserId = null;
        var client = _factory.CreateClient();

        // Act
        var response = await client.PostAsync("/api/auth/logout", content: null);

        // Assert
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
