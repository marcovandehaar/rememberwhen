namespace Indexer.Catalog;

// docs/v1-build-spec.md §2 — the contract the frontend reads. Additive only,
// except at a schemaVersion bump, which ships with a matching frontend.
public sealed class RwCatalog
{
    public const int CurrentSchemaVersion = 2;

    public int SchemaVersion { get; init; } = CurrentSchemaVersion;
    public List<RwMemory> Memories { get; init; } = [];
}

public sealed class RwMemory
{
    public required string Id { get; init; }
    public required string Name { get; init; }

    // A Memory with a Destination is a Trip; the globe shows only those.
    public RwDestination? Destination { get; init; }

    // The day the Memory began (its year is the year of this date). Always filled.
    public required DateOnly Date { get; init; }
    public required string CoverImage { get; init; }

    // The mid-size cover the timeline shows as a polaroid, next to the pin
    // thumbnail. Null for a Memory published before it existed: the frontend
    // falls back to the cover's Story rendition until the next reindex or cover change.
    public string? CoverPhoto { get; init; }
    public List<RwChapter> Chapters { get; init; } = [];
}

public sealed record RwDestination(string Name, Coordinate Coordinate);

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
