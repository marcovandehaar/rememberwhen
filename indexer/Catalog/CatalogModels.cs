namespace Indexer.Catalog;

// docs/v1-build-spec.md §2 — the contract the frontend reads. Additive only.
public sealed class RwCatalog
{
    public int SchemaVersion { get; init; } = 1;
    public List<RwMemory> Memories { get; init; } = [];
}

public sealed class RwMemory
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string DestinationName { get; init; }
    public required Coordinate DestinationCoordinate { get; init; }
    public required string CoverImage { get; init; }
    public List<RwChapter> Chapters { get; init; } = [];
}

public sealed class RwChapter
{
    public required string Id { get; init; }
    public Coordinate? Location { get; init; }
    public List<RwMediaItem> MediaItems { get; init; } = [];
}

public sealed class RwMediaItem
{
    public required string Id { get; init; }
    public required string MediaRef { get; init; }
    public required MediaKind Type { get; init; }
    public DateTimeOffset? CapturedAt { get; init; }
    public required StoryRect StoryRect { get; init; }
    public required double ShotDuration { get; init; }
}

public enum MediaKind
{
    Photo,
    Video,
}

// Normalised (0..1) crop within the source frame — the Indexer's formulaic
// framing for v1. Pan direction/zoom during playback is the renderer's job,
// derived from this rect plus the item's position in the sequence; see #12.
public readonly record struct StoryRect(double X, double Y, double Width, double Height);
