using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TelegramClone.Domain.Entities;
using TelegramClone.Infrastructure.Identity;

namespace TelegramClone.Infrastructure.Data;

public static class SeedData
{
    private static readonly Guid[] LegacySeedChatIds =
    {
        Guid.Parse("10000000-0000-0000-0000-000000000001"),
        Guid.Parse("10000000-0000-0000-0000-000000000002"),
        Guid.Parse("10000000-0000-0000-0000-000000000003"),
        Guid.Parse("10000000-0000-0000-0000-000000000004"),
        Guid.Parse("10000000-0000-0000-0000-000000000005"),
        Guid.Parse("10000000-0000-0000-0000-000000000006"),
        Guid.Parse("10000000-0000-0000-0000-000000000007"),
        Guid.Parse("10000000-0000-0000-0000-000000000008")
    };

    public static async Task InitializeAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<TelegramDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        await context.Database.MigrateAsync();

        // Remove legacy demo chats/messages if they exist, while keeping any user-created chats.
        await RemoveLegacySeedChatsAsync(context);

        if (await context.DomainUsers.AnyAsync())
        {
            return;
        }

        await SeedUsersAsync(context, userManager);
    }

    private static async Task SeedUsersAsync(TelegramDbContext context, UserManager<ApplicationUser> userManager)
    {
        var users = new List<User>
        {
            new() { Id = Guid.Parse("00000000-0000-0000-0000-000000000001"), Name = "You", Username = "me", Bio = "Hey there! I am using Telegram", AvatarUrl = "https://i.pravatar.cc/150?img=1", IsOnline = true },
            new() { Id = Guid.Parse("00000000-0000-0000-0000-000000000002"), Name = "Sarah Wilson", Username = "sarah_w", Bio = "Designer & Artist", AvatarUrl = "https://i.pravatar.cc/150?img=5", IsOnline = true },
            new() { Id = Guid.Parse("00000000-0000-0000-0000-000000000003"), Name = "Alex Chen", Username = "alexc", Bio = "Software Engineer", AvatarUrl = "https://i.pravatar.cc/150?img=3", IsOnline = false, LastSeen = DateTime.UtcNow.AddMinutes(-15) },
            new() { Id = Guid.Parse("00000000-0000-0000-0000-000000000004"), Name = "Emma Davis", Username = "emma_d", Bio = "Product Manager", AvatarUrl = "https://i.pravatar.cc/150?img=9", IsOnline = true },
            new() { Id = Guid.Parse("00000000-0000-0000-0000-000000000005"), Name = "James Miller", Username = "jamesm", Bio = "Photographer", AvatarUrl = "https://i.pravatar.cc/150?img=7", IsOnline = false, LastSeen = DateTime.UtcNow.AddHours(-2) },
            new() { Id = Guid.Parse("00000000-0000-0000-0000-000000000006"), Name = "Lisa Anderson", Username = "lisa_a", Bio = "Marketing Lead", AvatarUrl = "https://i.pravatar.cc/150?img=10", IsOnline = true },
            new() { Id = Guid.Parse("00000000-0000-0000-0000-000000000007"), Name = "David Kim", Username = "davidk", Bio = "Data Scientist", AvatarUrl = "https://i.pravatar.cc/150?img=11", IsOnline = false, LastSeen = DateTime.UtcNow.AddHours(-5) },
            new() { Id = Guid.Parse("00000000-0000-0000-0000-000000000008"), Name = "Sophie Taylor", Username = "sophiet", Bio = "UX Researcher", AvatarUrl = "https://i.pravatar.cc/150?img=16", IsOnline = true }
        };

        context.DomainUsers.AddRange(users);
        await context.SaveChangesAsync();

        var demoIdentityUser = new ApplicationUser
        {
            UserName = "demo@telegram.com",
            Email = "demo@telegram.com",
            DomainUserId = users[0].Id
        };

        var createResult = await userManager.CreateAsync(demoIdentityUser, "Demo@123");
        if (!createResult.Succeeded)
        {
            return;
        }

        users[0].IdentityUserId = demoIdentityUser.Id;
        context.DomainUsers.Update(users[0]);
        await context.SaveChangesAsync();
    }

    private static async Task RemoveLegacySeedChatsAsync(TelegramDbContext context)
    {
        var legacyChatIds = await context.Chats
            .Where(c => LegacySeedChatIds.Contains(c.Id))
            .Select(c => c.Id)
            .ToListAsync();

        if (legacyChatIds.Count == 0)
        {
            return;
        }

        var legacyMessageIds = await context.Messages
            .Where(m => legacyChatIds.Contains(m.ChatId))
            .Select(m => m.Id)
            .ToListAsync();

        if (legacyMessageIds.Count > 0)
        {
            await context.Reactions
                .Where(r => legacyMessageIds.Contains(r.MessageId))
                .ExecuteDeleteAsync();

            await context.VoiceNotes
                .Where(v => legacyMessageIds.Contains(v.MessageId))
                .ExecuteDeleteAsync();

            await context.Attachments
                .Where(a => legacyMessageIds.Contains(a.MessageId))
                .ExecuteDeleteAsync();

            await context.Messages
                .Where(m => legacyMessageIds.Contains(m.Id))
                .ExecuteDeleteAsync();
        }

        await context.ChatParticipants
            .Where(cp => legacyChatIds.Contains(cp.ChatId))
            .ExecuteDeleteAsync();

        await context.Chats
            .Where(c => legacyChatIds.Contains(c.Id))
            .ExecuteDeleteAsync();
    }
}
