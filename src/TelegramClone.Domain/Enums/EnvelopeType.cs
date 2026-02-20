namespace TelegramClone.Domain.Enums;

/// <summary>
/// Type of encrypted message envelope in the Signal Protocol.
/// </summary>
public enum EnvelopeType
{
    /// <summary>
    /// Initial message containing a PreKey bundle for session setup.
    /// </summary>
    PreKeyMessage = 1,

    /// <summary>
    /// Normal message within an established session.
    /// </summary>
    NormalMessage = 2,

    /// <summary>
    /// Group message using Sender Keys (for efficient group E2EE).
    /// </summary>
    SenderKeyMessage = 3
}
