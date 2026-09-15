namespace Indexer.Media;

public sealed record MediaMetadata(int Width, int Height, DateTimeOffset? CapturedAt, TimeSpan? Duration, Coordinate? Gps = null);
