namespace TelegramClone.Domain.Entities;

public class VoiceNote : BaseEntity
{
    public Guid MessageId { get; set; }
    public Message Message { get; set; } = null!;

    public string Url { get; set; } = string.Empty;
    public double Duration { get; set; }
    public int DurationMs { get; set; }

    /// <summary>
    /// Waveform data stored as comma-separated float values.
    /// </summary>
    public string WaveformData { get; set; } = string.Empty;

    // Helper to convert between double[] and string storage
    public double[] GetWaveform() =>
        string.IsNullOrEmpty(WaveformData)
            ? Array.Empty<double>()
            : WaveformData.Split(',').Select(double.Parse).ToArray();

    public void SetWaveform(double[] waveform) =>
        WaveformData = string.Join(",", waveform);
}
