namespace TelegramClone.Domain.Interfaces;

public interface IUnitOfWork : IDisposable
{
    IUserRepository Users { get; }
    IChatRepository Chats { get; }
    IMessageRepository Messages { get; }
    IReactionRepository Reactions { get; }
    Task<int> SaveChangesAsync();
}
