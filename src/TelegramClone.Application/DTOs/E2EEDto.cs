namespace TelegramClone.Application.DTOs;

// ──── Device Registration ────

public record RegisterDeviceDto(string? DeviceName);

public record DeviceDto(
    Guid Id,
    Guid UserId,
    int DeviceId,
    string? DeviceName,
    DateTime CreatedAt,
    DateTime LastActiveAt,
    bool IsActive
);

// ──── Key Bundle ────

/// <summary>
/// Uploaded by a device after registration. Contains all public keys needed
/// for other users to establish a Signal Protocol session with this device.
/// </summary>
public record UploadKeyBundleDto(
    int RegistrationId,

    /// <summary>Curve25519 public identity key (base64).</summary>
    string IdentityPublicKey,

    /// <summary>Current signed pre-key.</summary>
    PreKeyDto SignedPreKey,

    /// <summary>Post-quantum (ML-KEM/Kyber) pre-key.</summary>
    PreKeyDto? KyberPreKey,

    /// <summary>Batch of one-time pre-keys.</summary>
    IReadOnlyList<PreKeyDto> OneTimePreKeys
);

public record PreKeyDto(
    int KeyId,
    /// <summary>Public key bytes (base64).</summary>
    string PublicKey,
    /// <summary>Signature bytes (base64), required for signed/kyber pre-keys.</summary>
    string? Signature
);

/// <summary>
/// Returned when another user fetches a key bundle for session establishment.
/// </summary>
public record KeyBundleResponseDto(
    Guid UserId,
    int DeviceId,
    int RegistrationId,
    string IdentityPublicKey,
    PreKeyDto SignedPreKey,
    PreKeyDto? KyberPreKey,
    /// <summary>One one-time pre-key (consumed). Null if depleted.</summary>
    PreKeyDto? OneTimePreKey
);

// ──── Message Envelope ────

/// <summary>
/// Submitted by the sender. Contains encrypted Signal Protocol message.
/// Server does NOT inspect or parse the content.
/// </summary>
public record SubmitEnvelopeDto(
    Guid DestinationUserId,
    int DestinationDeviceId,
    /// <summary>1=PreKey, 2=Normal, 3=SenderKey</summary>
    int Type,
    /// <summary>Encrypted content (base64).</summary>
    string Content
);

/// <summary>
/// Returned when recipient fetches queued envelopes.
/// </summary>
public record EnvelopeResponseDto(
    Guid Id,
    Guid? SourceUserId,
    int? SourceDeviceId,
    int Type,
    string Content,
    DateTime ServerTimestamp
);

public record AcknowledgeEnvelopesDto(IReadOnlyList<Guid> EnvelopeIds);

// ──── Encrypted Attachments ────

public record InitiateUploadDto(
    /// <summary>Expected ciphertext size in bytes (optional, for quota checks).</summary>
    long? ExpectedSize,
    /// <summary>Total number of chunks expected (optional).</summary>
    int? TotalChunks
);

public record InitiateUploadResponseDto(
    Guid AttachmentId,
    string UploadUrl
);

public record CompleteUploadResponseDto(
    Guid AttachmentId,
    long CiphertextSize,
    bool IsComplete
);

// ──── Key Replenishment ────

public record ReplenishPreKeysDto(IReadOnlyList<PreKeyDto> OneTimePreKeys);
public record PreKeyCountDto(int Count);
