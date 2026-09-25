using System.IO;
using System.Text.Json;

namespace Indexer.Catalog;

// Persistence and merge logic for catalog.json, kept apart from
// CatalogBuilder (which only ever builds one fresh Memory from a Source
// Folder). A settings UI that indexes folders one at a time, and can
// reindex or remove any of them independently, needs the published
// catalog to hold many Memories side by side rather than being
// overwritten by whichever folder was indexed last.
public static class CatalogStore
{
    // #44: nothing here used to synchronize access to catalog.json, so two
    // overlapping requests (an index run's own Load+Save racing a photo
    // removal, say) could both try to open the file at the same instant and
    // one would get IOException("used by another process") from Windows'
    // share-mode check. UiServer.cs's handlers also hold this for their
    // whole Load-mutate-Save sequence, not just the individual calls here —
    // Monitor locks are reentrant per thread, so that nests safely with the
    // locking Load/Save already do on their own.
    public static readonly object Gate = new();

    public static RwCatalog Load(string catalogPath)
    {
        lock (Gate)
        {
            return File.Exists(catalogPath)
                ? JsonSerializer.Deserialize<RwCatalog>(File.ReadAllText(catalogPath), JsonOptions.Default)
                  ?? throw new InvalidDataException($"Catalogus op {catalogPath} kon niet gelezen worden.")
                : new RwCatalog();
        }
    }

    public static void Save(RwCatalog catalog, string catalogPath)
    {
        lock (Gate)
        {
            File.WriteAllText(catalogPath, JsonSerializer.Serialize(catalog, JsonOptions.Default));
        }
    }

    public static RwCatalog Replace(RwCatalog catalog, RwMemory memory) => new()
    {
        SchemaVersion = catalog.SchemaVersion,
        Memories = [.. catalog.Memories.Where(m => m.Id != memory.Id), memory],
    };

    public static RwCatalog RemoveMemory(RwCatalog catalog, string memoryId) => new()
    {
        SchemaVersion = catalog.SchemaVersion,
        Memories = [.. catalog.Memories.Where(m => m.Id != memoryId)],
    };

    public static bool IsCover(RwMemory memory, string itemId) =>
        memory.CoverImage.StartsWith($"media/{itemId}-", StringComparison.Ordinal);

    public sealed record RemoveMediaItemResult(RwCatalog Catalog, string? Error, bool NotFound = false);

    // The cover is never removable here — regenerating it needs the original
    // source file, which this review screen (deliberately) never touches —
    // and a Chapter can't be emptied to zero Media Items. Both are reported
    // back rather than silently applied, same as everywhere else in this API.
    public static RemoveMediaItemResult RemoveMediaItem(RwCatalog catalog, string memoryId, string itemId)
    {
        var memory = catalog.Memories.FirstOrDefault(m => m.Id == memoryId);
        if (memory is null) return new(catalog, "Onbekende Memory.", NotFound: true);

        var chapter = memory.Chapters.FirstOrDefault(c => c.MediaItems.Any(i => i.Id == itemId));
        if (chapter is null) return new(catalog, "Onbekend Media Item.", NotFound: true);

        if (IsCover(memory, itemId))
            return new(catalog, "Dit is de cover-foto en kan hier niet verwijderd worden. Verwijder het bestand uit de map en indexeer opnieuw.");
        if (chapter.MediaItems.Count <= 1)
            return new(catalog, "Er moet minstens één foto overblijven — verwijder in plaats daarvan de hele map.");

        var updatedChapter = new RwChapter
        {
            Id = chapter.Id,
            Location = chapter.Location,
            MediaItems = [.. chapter.MediaItems.Where(i => i.Id != itemId)],
        };
        var updatedMemory = new RwMemory
        {
            Id = memory.Id,
            Name = memory.Name,
            DestinationName = memory.DestinationName,
            DestinationCoordinate = memory.DestinationCoordinate,
            CoverImage = memory.CoverImage,
            Chapters = [.. memory.Chapters.Where(c => c.Id != chapter.Id), updatedChapter],
        };

        return new(Replace(catalog, updatedMemory), null);
    }

    // The new pin thumbnail must already be published under coverImage before
    // this runs (UiServer.cs does that, from the item's own story derivative
    // — never the original source file, same as everywhere else in this
    // review screen) — this only ever repoints the model at it.
    public static RwCatalog SetCover(RwCatalog catalog, string memoryId, string coverImage)
    {
        var memory = catalog.Memories.First(m => m.Id == memoryId);
        var updatedMemory = new RwMemory
        {
            Id = memory.Id,
            Name = memory.Name,
            DestinationName = memory.DestinationName,
            DestinationCoordinate = memory.DestinationCoordinate,
            CoverImage = coverImage,
            Chapters = memory.Chapters,
        };
        return Replace(catalog, updatedMemory);
    }

    // A Gazetteer edit alone never touches an already-indexed Memory — its
    // Destination was resolved once, at index time (ADR 0005). This
    // repoints a Memory at a (possibly different) Destination without the
    // rescan a full reindex would also bring — same name back in just
    // refreshes the coordinate, a different name re-homes the Memory.
    public static RwCatalog SetDestination(RwCatalog catalog, string memoryId, string destinationName, Coordinate coordinate)
    {
        var memory = catalog.Memories.First(m => m.Id == memoryId);
        var updatedMemory = new RwMemory
        {
            Id = memory.Id,
            Name = memory.Name,
            DestinationName = destinationName,
            DestinationCoordinate = coordinate,
            CoverImage = memory.CoverImage,
            Chapters = memory.Chapters,
        };
        return Replace(catalog, updatedMemory);
    }

    // Only the framing changes — everything else about the item, and every
    // other item's order in its Chapter, stays exactly where it was.
    public static RwCatalog SetStoryRect(RwCatalog catalog, string memoryId, string itemId, StoryRect storyRect)
    {
        var memory = catalog.Memories.First(m => m.Id == memoryId);
        var chapter = memory.Chapters.First(c => c.MediaItems.Any(i => i.Id == itemId));
        var item = chapter.MediaItems.First(i => i.Id == itemId);

        var updatedItem = new RwMediaItem
        {
            Id = item.Id,
            MediaRef = item.MediaRef,
            Type = item.Type,
            CapturedAt = item.CapturedAt,
            StoryRect = storyRect,
            ShotDuration = item.ShotDuration,
        };
        var updatedChapter = new RwChapter
        {
            Id = chapter.Id,
            Location = chapter.Location,
            MediaItems = [.. chapter.MediaItems.Select(i => i.Id == itemId ? updatedItem : i)],
        };
        var updatedMemory = new RwMemory
        {
            Id = memory.Id,
            Name = memory.Name,
            DestinationName = memory.DestinationName,
            DestinationCoordinate = memory.DestinationCoordinate,
            CoverImage = memory.CoverImage,
            Chapters = [.. memory.Chapters.Select(c => c.Id == chapter.Id ? updatedChapter : c)],
        };
        return Replace(catalog, updatedMemory);
    }

    // Every derivative file for a Chapter is named starting with the Chapter
    // id, e.g. "schotland-2010-c1-0000-...". Deleting by that prefix removes
    // the whole Chapter's files in one pass.
    public static void DeleteMediaFiles(string mediaDir, string prefix)
    {
        if (!Directory.Exists(mediaDir)) return;

        foreach (var file in Directory.GetFiles(mediaDir, $"{prefix}*"))
            File.Delete(file);
    }

    // Same idea as DeleteMediaFiles, but derives the prefix from the Memory's
    // actual Chapters instead of assuming the "-c1-" naming a single
    // hardcoded Chapter happens to produce today.
    public static void DeleteMediaFilesForMemory(string mediaDir, RwMemory memory)
    {
        foreach (var chapter in memory.Chapters)
            DeleteMediaFiles(mediaDir, $"{chapter.Id}-");
    }

    // A reindex republishes every file the rebuilt Memory still needs, but a
    // Source Folder that lost files since the last run leaves the old,
    // now-orphaned derivatives behind (e.g. item 0003 when only 0000-0002
    // exist now). Call this only after a rebuild has succeeded — pruning
    // first and building second would delete a working publish before
    // knowing the rebuild will too.
    public static void PruneStaleMediaFiles(string mediaDir, RwMemory memory)
    {
        if (!Directory.Exists(mediaDir)) return;

        var keep = memory.Chapters
            .SelectMany(c => c.MediaItems)
            .Select(i => Path.GetFileName(i.MediaRef))
            .Append(Path.GetFileName(memory.CoverImage))
            .ToHashSet();

        foreach (var chapter in memory.Chapters)
        {
            foreach (var file in Directory.GetFiles(mediaDir, $"{chapter.Id}-*"))
            {
                if (!keep.Contains(Path.GetFileName(file))) File.Delete(file);
            }
        }
    }
}
