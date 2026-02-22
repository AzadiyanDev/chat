using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
    [EnableRateLimiting("envelopes")]
    public async Task<IActionResult> SubmitEnvelopes([FromBody] SubmitEnvelopesRequest request)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        // === Security: validate SenderDeviceId belongs to the authenticated user ===
        var senderDevice = await _unitOfWork.Devices.GetDeviceAsync(userId.Value, request.SenderDeviceId);
        if (senderDevice == null)
            return StatusCode(403, new { error = "SenderDeviceId does not belong to the authenticated user." });

        // === Per-envelope validation ===
        var results = new List<object>();
        var validEnvelopes = new List<SubmitEnvelopeDto>();
        const int maxCiphertextBytes = 256 * 1024; // 256 KB

        for (int i = 0; i < request.Envelopes.Count; i++)
        {
            var env = request.Envelopes[i];

            // Validate EnvelopeId
            if (env.EnvelopeId == Guid.Empty)
            {
                results.Add(new { index = i, status = "rejected", error = "envelopeId is required." });
                continue;
            }

            // Validate base64 content and size
            byte[]? contentBytes;
            try
            {
                contentBytes = Convert.FromBase64String(env.Content);
            }
            catch
            {
                results.Add(new { index = i, status = "rejected", error = "content is not valid base64." });
                continue;
            }

            if (contentBytes.Length > maxCiphertextBytes)
            {
                results.Add(new { index = i, status = "rejected", error = $"content exceeds {maxCiphertextBytes} bytes." });
                continue;
            }

            validEnvelopes.Add(env);
            results.Add(new { index = i, status = "accepted" });
        }

        if (validEnvelopes.Count > 0)
        {
            var submitResults = await _envelopeService.SubmitEnvelopesAsync(
                userId.Value, request.SenderDeviceId, validEnvelopes);

            // Merge service-level results (dedup/queue-full) back into the response
            var submitResultMap = submitResults.ToDictionary(r => r.EnvelopeId);
            for (int i = 0; i < results.Count; i++)
            {
                var result = (dynamic)results[i];
                if (result.status == "accepted")
                {
                    var env = request.Envelopes[(int)result.index];
                    if (submitResultMap.TryGetValue(env.EnvelopeId, out var sr) && sr.Status != "accepted")
                    {
                        results[i] = new { index = (int)result.index, status = sr.Status, error = sr.Error ?? "" };
                    }
                }
            }

            // Notify each destination user via SignalR group — only for truly accepted envelopes
            var acceptedIds = submitResults
                .Where(r => r.Status == "accepted")
                .Select(r => r.EnvelopeId)
                .ToHashSet();

            foreach (var env in validEnvelopes.Where(e => acceptedIds.Contains(e.EnvelopeId)))
            {
                await _hubContext.Clients.Group($"user_{env.DestinationUserId}")
                    .SendAsync("NewEnvelope", new
                    {
                        destinationDeviceId = env.DestinationDeviceId,
                        timestamp = DateTime.UtcNow
                    });
            }
        }

        var acceptedCount = results.Count(r => ((dynamic)r).status == "accepted");
        return Ok(new { submitted = acceptedCount, results });
    }

    /// <summary>
    /// Fetch queued (undelivered) envelopes for the current device.
    /// </summary>
    [HttpGet("{deviceId:int}")]
    [EnableRateLimiting("envelopes")]
    public async Task<IActionResult> FetchQueued(int deviceId, [FromQuery] int limit = 100)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        // Security: verify device belongs to the authenticated user
        var device = await _unitOfWork.Devices.GetDeviceAsync(userId.Value, deviceId);
        if (device == null)
            return StatusCode(403, new { error = "DeviceId does not belong to the authenticated user." });

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
    [EnableRateLimiting("envelopes")]
    public async Task<IActionResult> Acknowledge(int deviceId, [FromBody] AcknowledgeEnvelopesDto dto)
    {
        var userId = await GetCurrentDomainUserIdAsync();
        if (userId == null) return Unauthorized();

        // Security: verify device belongs to the authenticated user
        var device = await _unitOfWork.Devices.GetDeviceAsync(userId.Value, deviceId);
        if (device == null)
            return StatusCode(403, new { error = "DeviceId does not belong to the authenticated user." });

        await _envelopeService.AcknowledgeAsync(userId.Value, deviceId, dto);
        return NoContent();
    }
}

public record SubmitEnvelopesRequest(
    int SenderDeviceId,
    IReadOnlyList<SubmitEnvelopeDto> Envelopes
);
