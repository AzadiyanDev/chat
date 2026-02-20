using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using TelegramClone.Application.DTOs;
using TelegramClone.Application.Interfaces;
using TelegramClone.Domain.Interfaces;
using TelegramClone.Web.Hubs;

namespace TelegramClone.Web.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class EnvelopesController : ControllerBase
{
    private readonly IMessageEnvelopeService _envelopeService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IHubContext<ChatHub> _hubContext;

    public EnvelopesController(
        IMessageEnvelopeService envelopeService,
        IUnitOfWork unitOfWork,
        IHubContext<ChatHub> hubContext)
    {
        _envelopeService = envelopeService;
        _unitOfWork = unitOfWork;
        _hubContext = hubContext;
    }

    private async Task<Guid?> GetCurrentDomainUserIdAsync()
    {
        var identityId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(identityId)) return null;
        var user = await _unitOfWork.Users.GetByIdentityIdAsync(identityId);
        return user?.Id;
    }

    /// <summary>
    /// Submit encrypted message envelopes for delivery.
    /// Server NEVER inspects or decrypts the content.
    /// Supports multi-device fan-out (multiple envelopes per request).
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> SubmitEnvelopes([FromBody] SubmitEnvelopesRequest request)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        await _envelopeService.SubmitEnvelopesAsync(userId.Value, request.SenderDeviceId, request.Envelopes);

        // Notify each destination device via SignalR (lightweight push — no content)
        foreach (var env in request.Envelopes)
        {
            await _hubContext.Clients.User(env.DestinationUserId.ToString())
                .SendAsync("NewEnvelope", new
                {
                    destinationDeviceId = env.DestinationDeviceId,
                    timestamp = DateTime.UtcNow
                });
        }

        return Ok(new { submitted = request.Envelopes.Count });
    }

    /// <summary>
    /// Fetch queued (undelivered) envelopes for the current device.
    /// </summary>
    [HttpGet("{deviceId:int}")]
    public async Task<IActionResult> FetchQueued(int deviceId, [FromQuery] int limit = 100)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        var envelopes = await _envelopeService.FetchQueuedAsync(userId.Value, deviceId, limit);

        // Include OTPK count in header so client knows if replenishment is needed
        var otpkCount = await _unitOfWork.KeyBundles.GetAvailableOneTimePreKeyCountAsync(userId.Value, deviceId);
        Response.Headers.Append("X-OTPK-Count", otpkCount.ToString());

        return Ok(envelopes);
    }

    /// <summary>
    /// Acknowledge receipt of envelopes. Server deletes them after acknowledgment.
    /// </summary>
    [HttpPost("ack/{deviceId:int}")]
    public async Task<IActionResult> Acknowledge(int deviceId, [FromBody] AcknowledgeEnvelopesDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        await _envelopeService.AcknowledgeAsync(userId.Value, deviceId, dto);
        return NoContent();
    }
}

public record SubmitEnvelopesRequest(
    int SenderDeviceId,
    IReadOnlyList<SubmitEnvelopeDto> Envelopes
);
