using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class UnitOfWork : IUnitOfWork
{
    private readonly TelegramDbContext _context;

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

    public void Dispose() => _context.Dispose();
}
