using TelegramClone.Domain.Enums;

namespace TelegramClone.Application.DTOs;

public class MessageDto
{
    public Guid Id { get; set; }
    public Guid ChatId { get; set; }
    public Guid SenderId { get; set; }
    public string? SenderName { get; set; }
    public string? SenderAvatarUrl { get; set; }
    public string? Text { get; set; }
    public DateTime Timestamp { get; set; }
    public MessageStatus Status { get; set; }
    public bool IsDeleted { get; set; }
    public Guid? ReplyToId { get; set; }
    public MessageDto? ReplyTo { get; set; }
    public List<AttachmentDto> Attachments { get; set; } = new();
    public VoiceNoteDto? Voice { get; set; }
    public List<ReactionGroupDto> Reactions { get; set; } = new();
}

public class SendMessageDto
{
    public string? Text { get; set; }
    public Guid? ReplyToId { get; set; }
}

public class AttachmentDto
{
    public Guid Id { get; set; }
    public AttachmentType Type { get; set; }
    public string Url { get; set; } = string.Empty;
    public string? Name { get; set; }
    public long? Size { get; set; }
    public string? ThumbnailUrl { get; set; }
}

public class VoiceNoteDto
{
    public string Url { get; set; } = string.Empty;
    public double Duration { get; set; }
    public int DurationMs { get; set; }
    public double[] Waveform { get; set; } = Array.Empty<double>();
}

public class ReactionGroupDto
{
    public string Emoji { get; set; } = string.Empty;
    public List<Guid> UserIds { get; set; } = new();
}

public class AddReactionDto
{
    public string Emoji { get; set; } = string.Empty;
}
