using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;
using TelegramClone.Infrastructure.Identity;
using TelegramClone.Infrastructure.Repositories;
using TelegramClone.Infrastructure.Services;

namespace TelegramClone.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, string connectionString, string uploadPath)
    {
        // EF Core + SQL Server
        services.AddDbContext<TelegramDbContext>(options =>
            options.UseSqlServer(connectionString));

        // ASP.NET Identity
        services.AddIdentity<ApplicationUser, IdentityRole>(options =>
        {
            options.Password.RequireDigit = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireUppercase = true;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequiredLength = 6;
            options.User.RequireUniqueEmail = true;
        })
        .AddEntityFrameworkStores<TelegramDbContext>()
        .AddDefaultTokenProviders();

        // Cookie config — HARDENED
        services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = Microsoft.AspNetCore.Http.CookieSecurePolicy.Always;
            options.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict;
            options.ExpireTimeSpan = TimeSpan.FromHours(12);
            options.SlidingExpiration = true;
            options.LoginPath = "/api/auth/unauthorized";
            options.AccessDeniedPath = "/api/auth/forbidden";
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = 401;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = 403;
                return Task.CompletedTask;
            };
        });

        // Repositories
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // Services
        services.AddScoped<IAuthService, AuthService>();
        services.AddSingleton<IFileStorageService>(new LocalFileStorageService(uploadPath));

        // E2EE encrypted attachment service (needs storage path)
        services.AddScoped<IEncryptedAttachmentService>(sp =>
            new TelegramClone.Application.Services.EncryptedAttachmentService(
                sp.GetRequiredService<IUnitOfWork>(), uploadPath));

        return services;
    }
}
