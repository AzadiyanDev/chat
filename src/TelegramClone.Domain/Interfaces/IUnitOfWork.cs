namespace TelegramClone.Domain.Interfaces;

public interface IUnitOfWork : IDisposable
{
    IUserRepository Users { get; }
    IChatRepository Chats { get; }
    IMessageRepository Messages { get; }
    IReactionRepository Reactions { get; }

    // E2EE repositories
    IDeviceRepository Devices { get; }
    IKeyBundleRepository KeyBundles { get; }
    IMessageEnvelopeRepository Envelopes { get; }
    IEncryptedAttachmentRepository EncryptedAttachments { get; }

    Task<int> SaveChangesAsync();
}
