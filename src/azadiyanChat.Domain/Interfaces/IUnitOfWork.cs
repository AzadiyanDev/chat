namespace azadiyanChat.Domain.Interfaces;

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

    /// <summary>
    /// Begin an explicit database transaction.
    /// Returns an IDisposable/IAsyncDisposable transaction that must be committed or rolled back.
    /// </summary>
    Task<IAsyncDisposable> BeginTransactionAsync();

    /// <summary>
    /// Commit the current transaction.
    /// </summary>
    Task CommitTransactionAsync();

    /// <summary>
    /// Rollback the current transaction.
    /// </summary>
    Task RollbackTransactionAsync();
}
