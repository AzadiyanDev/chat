using azadiyanChat.Domain.Interfaces;

namespace azadiyanChat.Web.Services;

/// <summary>
/// Background service that periodically cleans up expired envelopes.
/// Envelopes have a 30-day TTL; this runs every hour to remove expired ones.
/// </summary>
public class EnvelopeCleanupService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<EnvelopeCleanupService> _logger;
    private readonly TimeSpan _interval = TimeSpan.FromHours(1);

    public EnvelopeCleanupService(IServiceProvider serviceProvider, ILogger<EnvelopeCleanupService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

                await unitOfWork.Envelopes.DeleteExpiredAsync();
                _logger.LogInformation("Expired envelopes cleaned up at {Time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cleaning up expired envelopes");
            }

            await Task.Delay(_interval, stoppingToken);
        }
    }
}
