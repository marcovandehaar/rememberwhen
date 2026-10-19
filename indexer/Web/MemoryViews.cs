using Indexer.Catalog;
using Indexer.Config;

namespace Indexer.Web;

public sealed record MemoryFolderView(string Path, bool Exists, int AlsoIn);

// What the Indexer list shows for one Memory (#65): everything the list, its
// filter and the detail need, so the page never has to join the config and the
// catalogue itself.
public sealed record MemoryView(
    string MemoryId,
    string Name,
    // Null: the Memory is not a Trip.
    string? DestinationName,
    Coordinate? DestinationCoordinate,
    // The effective date; null until the first index.
    DateOnly? Date,
    DateOnly? DateOverride,
    DateOnly? DefaultDate,
    bool NeedsReindex,
    bool NeverIndexed,
    List<MemoryFolderView> Folders,
    DateTimeOffset? IndexedAt,
    string? CoverUrl,
    List<MediaItemView> MediaItems);

public static class MemoryViews
{
    /// <summary>Not-yet-indexed Memories first (they need attention), then newest by effective date.</summary>
    public static List<MemoryView> Build(IndexerConfig config, RwCatalog catalog, Func<string, bool> folderExists, Func<string, string> mediaUrl)
    {
        var views = config.Memories.Select(memory =>
        {
            var neverIndexed = memory.IndexedAt is null;
            var published = neverIndexed ? null : catalog.Memories.FirstOrDefault(m => m.Id == memory.MemoryId);

            var items = published?.Chapters
                .SelectMany(c => c.MediaItems)
                .Select(item => new MediaItemView(item.Id, mediaUrl(item.MediaRef), item.Type, item.CapturedAt, CatalogStore.IsCover(published, item.Id)))
                .ToList() ?? [];

            return new MemoryView(
                memory.MemoryId,
                memory.Name,
                memory.DestinationName,
                published?.Destination?.Coordinate,
                neverIndexed ? null : memory.EffectiveDate,
                memory.DateOverride,
                neverIndexed ? null : memory.DefaultDate,
                memory.NeedsReindex,
                neverIndexed,
                [.. memory.SourceFolders.Select(path => new MemoryFolderView(
                    path, folderExists(path), config.Memories.Count(other => other != memory && other.SourceFolders.Contains(path))))],
                memory.IndexedAt,
                published is null ? null : mediaUrl(published.CoverImage),
                items);
        });

        return [.. views.OrderByDescending(v => v.NeverIndexed).ThenByDescending(v => v.Date).ThenBy(v => v.Name)];
    }
}
