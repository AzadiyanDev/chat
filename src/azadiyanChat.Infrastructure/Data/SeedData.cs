using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using azadiyanChat.Application.Interfaces;
using azadiyanChat.Domain.Entities;
using azadiyanChat.Infrastructure.Identity;

namespace azadiyanChat.Infrastructure.Data;

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

    private static readonly Guid[] SeedUserIds =
    {
        Guid.Parse("00000000-0000-0000-0000-000000000001"),
        Guid.Parse("00000000-0000-0000-0000-000000000002"),
        Guid.Parse("00000000-0000-0000-0000-000000000003"),
        Guid.Parse("00000000-0000-0000-0000-000000000004"),
        Guid.Parse("00000000-0000-0000-0000-000000000005"),
        Guid.Parse("00000000-0000-0000-0000-000000000006"),
        Guid.Parse("00000000-0000-0000-0000-000000000007"),
        Guid.Parse("00000000-0000-0000-0000-000000000008")
    };

    private static readonly string[] LocalSeedAvatarPaths =
    {
        "/avatars/seed-1.svg",
        "/avatars/seed-2.svg",
        "/avatars/seed-3.svg",
        "/avatars/seed-4.svg",
        "/avatars/seed-5.svg",
        "/avatars/seed-6.svg",
        "/avatars/seed-7.svg",
        "/avatars/seed-8.svg"
    };

    public static async Task InitializeAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<azadiyanChatDbContext>();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var messageTextProtection = scope.ServiceProvider.GetRequiredService<IMessageTextProtectionService>();

        // InMemory provider does not support migrations; use EnsureCreated instead
        if (context.Database.ProviderName == "Microsoft.EntityFrameworkCore.InMemory")
            await context.Database.EnsureCreatedAsync();
        else
            await context.Database.MigrateAsync();

        // Remove legacy demo chats/messages if they exist, while keeping any user-created chats.
        await RemoveLegacySeedChatsAsync(context);

        // Migrate any external avatar URLs to bundled local assets.
        await MigrateLegacyExternalAvatarsAsync(context);

        // Migrate old plaintext message bodies to encrypted chunks.
        await MigrateLegacyPlaintextMessagesAsync(context, messageTextProtection);

        if (await context.DomainUsers.AnyAsync())
        {
            return;
        }

        await SeedUsersAsync(context, userManager);
    }

    private static async Task SeedUsersAsync(azadiyanChatDbContext context, UserManager<ApplicationUser> userManager)
    {
        var users = new List<User>
        {
            new() { Id = SeedUserIds[0], Name = "You", Username = "me", Bio = "Hey there! I am using azadiyanChat", AvatarUrl = LocalSeedAvatarPaths[0], IsOnline = true },
            new() { Id = SeedUserIds[1], Name = "Sarah Wilson", Username = "sarah_w", Bio = "Designer & Artist", AvatarUrl = LocalSeedAvatarPaths[1], IsOnline = true },
            new() { Id = SeedUserIds[2], Name = "Alex Chen", Username = "alexc", Bio = "Software Engineer", AvatarUrl = LocalSeedAvatarPaths[2], IsOnline = false, LastSeen = DateTime.UtcNow.AddMinutes(-15) },
            new() { Id = SeedUserIds[3], Name = "Emma Davis", Username = "emma_d", Bio = "Product Manager", AvatarUrl = LocalSeedAvatarPaths[3], IsOnline = true },
            new() { Id = SeedUserIds[4], Name = "James Miller", Username = "jamesm", Bio = "Photographer", AvatarUrl = LocalSeedAvatarPaths[4], IsOnline = false, LastSeen = DateTime.UtcNow.AddHours(-2) },
            new() { Id = SeedUserIds[5], Name = "Lisa Anderson", Username = "lisa_a", Bio = "Marketing Lead", AvatarUrl = LocalSeedAvatarPaths[5], IsOnline = true },
            new() { Id = SeedUserIds[6], Name = "David Kim", Username = "davidk", Bio = "Data Scientist", AvatarUrl = LocalSeedAvatarPaths[6], IsOnline = false, LastSeen = DateTime.UtcNow.AddHours(-5) },
            new() { Id = SeedUserIds[7], Name = "Sophie Taylor", Username = "sophiet", Bio = "UX Researcher", AvatarUrl = LocalSeedAvatarPaths[7], IsOnline = true }
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

    private static async Task MigrateLegacyExternalAvatarsAsync(azadiyanChatDbContext context)
    {
        var usersToUpdate = await context.DomainUsers
            .Where(u =>
                string.IsNullOrEmpty(u.AvatarUrl) ||
                u.AvatarUrl.StartsWith("https://") ||
                u.AvatarUrl.StartsWith("http://"))
            .ToListAsync();

        if (usersToUpdate.Count == 0)
        {
            return;
        }

        foreach (var user in usersToUpdate)
        {
            user.AvatarUrl = ResolveLocalAvatarPath(user.Id);
        }

        await context.SaveChangesAsync();
    }

    private static async Task MigrateLegacyPlaintextMessagesAsync(
        azadiyanChatDbContext context,
        IMessageTextProtectionService messageTextProtection)
    {
        var messagesToMigrate = await context.Messages
            .Where(m => !string.IsNullOrEmpty(m.Text))
            .Select(m => new
            {
                m.Id,
                m.ChatId,
                Text = m.Text!
            })
            .ToListAsync();

        if (messagesToMigrate.Count == 0)
        {
            return;
        }

        var chunksToInsert = new List<MessageTextChunk>();

        foreach (var message in messagesToMigrate)
        {
            var alreadyHasChunks = await context.MessageTextChunks
                .AsNoTracking()
                .AnyAsync(c => c.MessageId == message.Id);

            if (!alreadyHasChunks)
            {
                var encryptedChunks = messageTextProtection.Encrypt(message.ChatId, message.Id, message.Text);
                foreach (var chunk in encryptedChunks)
                {
                    chunksToInsert.Add(new MessageTextChunk
                    {
                        MessageId = message.Id,
                        ChunkIndex = chunk.ChunkIndex,
                        Payload = chunk.Payload
                    });
                }

                if (encryptedChunks.Count > 0)
                {
                    context.MessageTextChunks.AddRange(chunksToInsert);
                    chunksToInsert.Clear();
                    await context.SaveChangesAsync();
                }
            }

            // Remove plaintext from DB after successful chunk encryption (or when chunks already exist).
            await context.Messages
                .Where(m => m.Id == message.Id && m.Text != null)
                .ExecuteUpdateAsync(setters => setters.SetProperty(m => m.Text, (string?)null));
        }
    }

    private static string ResolveLocalAvatarPath(Guid userId)
    {
        var knownIndex = Array.IndexOf(SeedUserIds, userId);
        if (knownIndex >= 0)
        {
            return LocalSeedAvatarPaths[knownIndex];
        }

        var bytes = userId.ToByteArray();
        var checksum = 0;
        for (var i = 0; i < bytes.Length; i++)
        {
            checksum += bytes[i];
        }

        var fallbackIndex = checksum % LocalSeedAvatarPaths.Length;
        return LocalSeedAvatarPaths[fallbackIndex];
    }

    private static async Task RemoveLegacySeedChatsAsync(azadiyanChatDbContext context)
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
