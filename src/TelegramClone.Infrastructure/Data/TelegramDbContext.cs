using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Entities;
using TelegramClone.Infrastructure.Identity;

namespace TelegramClone.Infrastructure.Data;

public class TelegramDbContext : IdentityDbContext<ApplicationUser>
{
    public TelegramDbContext(DbContextOptions<TelegramDbContext> options) : base(options) { }

    public DbSet<User> DomainUsers => Set<User>();
    public DbSet<Chat> Chats => Set<Chat>();
    public DbSet<ChatParticipant> ChatParticipants => Set<ChatParticipant>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<VoiceNote> VoiceNotes => Set<VoiceNote>();
    public DbSet<Reaction> Reactions => Set<Reaction>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // User
        builder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(100).IsRequired();
            entity.Property(e => e.Username).HasMaxLength(50);
            entity.Property(e => e.Bio).HasMaxLength(500);
            entity.Property(e => e.AvatarUrl).HasMaxLength(500);
            entity.Property(e => e.IdentityUserId).HasMaxLength(450);
            entity.HasIndex(e => e.IdentityUserId).IsUnique();
            entity.HasIndex(e => e.Username).IsUnique().HasFilter("[Username] IS NOT NULL");
        });

        // Chat
        builder.Entity<Chat>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(200);
            entity.Property(e => e.AvatarUrl).HasMaxLength(500);
            entity.Property(e => e.Description).HasMaxLength(1000);
        });

        // ChatParticipant (many-to-many join entity)
        builder.Entity<ChatParticipant>(entity =>
        {
            entity.HasKey(e => new { e.ChatId, e.UserId });
            entity.Property(e => e.Role).HasMaxLength(20).HasDefaultValue("member");

            entity.HasOne(e => e.Chat)
                .WithMany(c => c.Participants)
                .HasForeignKey(e => e.ChatId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.User)
                .WithMany(u => u.ChatParticipants)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Message
        builder.Entity<Message>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Text).HasMaxLength(4000);

            entity.HasOne(e => e.Chat)
                .WithMany(c => c.Messages)
                .HasForeignKey(e => e.ChatId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Sender)
                .WithMany(u => u.Messages)
                .HasForeignKey(e => e.SenderId)
                .OnDelete(DeleteBehavior.Restrict);

            // Self-referencing for reply
            entity.HasOne(e => e.ReplyTo)
                .WithMany()
                .HasForeignKey(e => e.ReplyToId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasIndex(e => new { e.ChatId, e.Timestamp });
        });

        // Attachment
        builder.Entity<Attachment>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Url).HasMaxLength(500).IsRequired();
            entity.Property(e => e.Name).HasMaxLength(255);
            entity.Property(e => e.ThumbnailUrl).HasMaxLength(500);

            entity.HasOne(e => e.Message)
                .WithMany(m => m.Attachments)
                .HasForeignKey(e => e.MessageId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // VoiceNote
        builder.Entity<VoiceNote>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Url).HasMaxLength(500).IsRequired();
            entity.Property(e => e.WaveformData).HasMaxLength(2000);

            entity.HasOne(e => e.Message)
                .WithOne(m => m.VoiceNote)
                .HasForeignKey<VoiceNote>(e => e.MessageId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Reaction
        builder.Entity<Reaction>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Emoji).HasMaxLength(10).IsRequired();

            entity.HasOne(e => e.Message)
                .WithMany(m => m.Reactions)
                .HasForeignKey(e => e.MessageId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.User)
                .WithMany(u => u.Reactions)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(e => new { e.MessageId, e.UserId, e.Emoji }).IsUnique();
        });
    }
}
