using azadiyanChat.Application.DTOs;

namespace azadiyanChat.Application.Interfaces;

/// <summary>
/// Manages encrypted message envelopes.
/// Server is a dumb queue — it never inspects, decrypts, or modifies content.
/// </summary>
public interface IMessageEnvelopeService
{
    /// <summary>
    /// Submit one or more encrypted envelopes for delivery (multi-device fan-out).
    /// Returns per-item results (accepted/duplicate/rejected).
    /// </summary>
    Task<IEnumerable<EnvelopeSubmitResultDto>> SubmitEnvelopesAsync(
        Guid senderUserId, int senderDeviceId, IEnumerable<SubmitEnvelopeDto> envelopes);

    /// <summary>
    /// Fetch queued (undelivered) envelopes for the requesting device.
    /// </summary>
    Task<IEnumerable<EnvelopeResponseDto>> FetchQueuedAsync(Guid userId, int deviceId, int limit = 100);

    /// <summary>
    /// Acknowledge receipt of envelopes (allows server to delete them).
    /// </summary>
    Task AcknowledgeAsync(Guid userId, int deviceId, AcknowledgeEnvelopesDto dto);
}
