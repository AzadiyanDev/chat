using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.IntegrationTests;

/// <summary>
/// Test fixture that replaces SQL Server with InMemory, bypasses cookie auth
/// with a configurable test scheme, and skips SPA file setup.
/// Each factory instance gets an isolated database.
/// </summary>
public class TestWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = $"TestDb_{Guid.NewGuid():N}";

    /// <summary>
    /// Identity user ID that the test auth handler injects into claims.
    /// Set before creating the HttpClient.
    /// </summary>
    public string? TestIdentityUserId { get; set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        builder.ConfigureServices(services =>
        {
            // ── Replace DbContext with InMemory ──
            // Remove ALL DbContext-related descriptors (options, configurations, the context itself)
            // This prevents "multiple providers registered" error.
            var descriptorsToRemove = services.Where(d =>
                d.ServiceType == typeof(DbContextOptions<TelegramDbContext>) ||
                d.ServiceType == typeof(TelegramDbContext) ||
                d.ImplementationType == typeof(TelegramDbContext) ||
                d.ServiceType.FullName?.Contains("DbContextOptions") == true
            ).ToList();
            foreach (var d in descriptorsToRemove) services.Remove(d);

            // Register fresh DbContextOptions with InMemory only — bypass AddDbContext
            // so that no previous configuration actions (UseSqlServer) are re-applied.
            services.AddSingleton<DbContextOptions<TelegramDbContext>>(_ =>
                new DbContextOptionsBuilder<TelegramDbContext>()
                    .UseInMemoryDatabase(_dbName)
                    .Options);

            services.AddScoped<TelegramDbContext>(sp =>
                new TelegramDbContext(sp.GetRequiredService<DbContextOptions<TelegramDbContext>>()));

            // ── Replace Authentication with test handler ──
            services.AddAuthentication(o =>
            {
                o.DefaultAuthenticateScheme = "Test";
                o.DefaultChallengeScheme = "Test";
            }).AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });

            // Make test config available to handler via DI
            services.AddSingleton(this);
        });
    }
}

/// <summary>
/// Authentication handler that auto-authenticates every request using the
/// identity user ID configured on <see cref="TestWebApplicationFactory.TestIdentityUserId"/>.
/// </summary>
public class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly TestWebApplicationFactory _factory;

    public TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        TestWebApplicationFactory factory)
        : base(options, logger, encoder)
    {
        _factory = factory;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (string.IsNullOrEmpty(_factory.TestIdentityUserId))
            return Task.FromResult(AuthenticateResult.Fail("No TestIdentityUserId configured."));

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, _factory.TestIdentityUserId),
            new Claim(ClaimTypes.Name, "testuser@test.com"),
        };
        var identity = new ClaimsIdentity(claims, "Test");
        var principal = new ClaimsPrincipal(identity);
        var ticket = new AuthenticationTicket(principal, "Test");

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
