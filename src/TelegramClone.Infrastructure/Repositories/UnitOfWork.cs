using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

/// <summary>No-op disposable returned when the provider does not support transactions (e.g. InMemory).</summary>
internal sealed class NullAsyncDisposable : IAsyncDisposable
{
    public static readonly NullAsyncDisposable Instance = new();
    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

public class UnitOfWork : IUnitOfWork
{
    private readonly TelegramDbContext _context;
    private IDbContextTransaction? _currentTransaction;

    public IUserRepository Users { get; }
    public IChatRepository Chats { get; }
    public IMessageRepository Messages { get; }
    public IReactionRepository Reactions { get; }

    // E2EE repositories
    public IDeviceRepository Devices { get; }
    public IKeyBundleRepository KeyBundles { get; }
    public IMessageEnvelopeRepository Envelopes { get; }
    public IEncryptedAttachmentRepository EncryptedAttachments { get; }

    public UnitOfWork(TelegramDbContext context)
    {
        _context = context;
        Users = new UserRepository(context);
        Chats = new ChatRepository(context);
        Messages = new MessageRepository(context);
        Reactions = new ReactionRepository(context);

        // E2EE repositories
        Devices = new DeviceRepository(context);
        KeyBundles = new KeyBundleRepository(context);
        Envelopes = new MessageEnvelopeRepository(context);
        EncryptedAttachments = new EncryptedAttachmentRepository(context);
    }

    public async Task<int> SaveChangesAsync() => await _context.SaveChangesAsync();

    public async Task<IAsyncDisposable> BeginTransactionAsync()
    {
        // InMemory provider does not support transactions
        if (_context.Database.ProviderName == "Microsoft.EntityFrameworkCore.InMemory")
            return NullAsyncDisposable.Instance;

        _currentTransaction = await _context.Database.BeginTransactionAsync();
        return _currentTransaction;
    }

    public async Task CommitTransactionAsync()
    {
        if (_currentTransaction != null)
        {
            await _currentTransaction.CommitAsync();
            await _currentTransaction.DisposeAsync();
            _currentTransaction = null;
        }
    }

    public async Task RollbackTransactionAsync()
    {
        if (_currentTransaction != null)
        {
            await _currentTransaction.RollbackAsync();
            await _currentTransaction.DisposeAsync();
            _currentTransaction = null;
        }
    }

    public void Dispose()
    {
        _currentTransaction?.Dispose();
        _context.Dispose();
    }
}
