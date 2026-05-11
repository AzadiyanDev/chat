namespace azadiyanChat.Infrastructure.Services;

public class MessageTextProtectionOptions
{
    public string MasterKey { get; set; } = string.Empty;
    // Backward-compatible alias for older configs.
    public string Key { get; set; } = string.Empty;
    public int ChunkSizeBytes { get; set; } = 512;
}
