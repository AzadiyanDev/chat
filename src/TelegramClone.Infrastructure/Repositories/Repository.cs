using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Infrastructure.Data;

namespace TelegramClone.Infrastructure.Repositories;

public class Repository<T> : IRepository<T> where T : class
{
    protected readonly TelegramDbContext _context;
    protected readonly DbSet<T> _dbSet;

    public Repository(TelegramDbContext context)
    {
        _context = context;
        _dbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(Guid id) => await _dbSet.FindAsync(id);

    public async Task<IEnumerable<T>> GetAllAsync() => await _dbSet.ToListAsync();

    public async Task<IEnumerable<T>> FindAsync(Expression<Func<T, bool>> predicate)
        => await _dbSet.Where(predicate).ToListAsync();

    public async Task AddAsync(T entity) => await _dbSet.AddAsync(entity);

    public void Update(T entity) => _dbSet.Update(entity);

    public void Remove(T entity) => _dbSet.Remove(entity);
}
