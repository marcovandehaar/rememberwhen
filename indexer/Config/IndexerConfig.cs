using System.IO;
using System.Text.Json;

namespace Indexer.Config;

// The one configuration file docs/v1-build-spec.md's Configuratie section
// calls for (#22, #37): Source Folders, the Gazetteer path, and the output
// location. Starts empty on disk — unlike the Gazetteer, there is nothing
// to seed by hand before the settings UI can be used.
// One Source Folder maps to at most one published Memory. Recorded here so
// the settings UI can offer "reindex" and "remove" on something already
// published, rather than only ever offering a first-time index.
public sealed class IndexedFolder
{
    public required string SourceFolder { get; set; }
    public required string MemoryId { get; set; }
    public required string MemoryName { get; set; }
    public required string DestinationName { get; set; }
    public DateTimeOffset IndexedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class IndexerConfig
{
    public List<string> SourceFolders { get; set; } = [];
    public List<IndexedFolder> IndexedFolders { get; set; } = [];
    public string GazetteerPath { get; set; } = "gazetteer.json";
    public string OutputFolder { get; set; } = "output";

    // Curation records and run logs (see CurationFile.cs's header) — kept
    // apart from OutputFolder so they never end up published alongside the
    // catalogue and media derivatives that folder holds. Named
    // "curation-logs", not "curation": Windows path lookups are
    // case-insensitive, so a bare "curation" would resolve to the existing
    // indexer/Curation/ source folder and write runtime files into it.
    public string CurationFolder { get; set; } = "curation-logs";

    // Empty means "not configured yet" — the folder picker falls back to
    // listing drives. Set once (e.g. to a NAS share all Source Folders live
    // under) and the picker starts there instead, never wandering above it.
    public string SourceFoldersRoot { get; set; } = "";

    public static IndexerConfig Load(string path)
    {
        if (!File.Exists(path)) return new IndexerConfig();

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<IndexerConfig>(json, JsonOptions.Default)
               ?? throw new InvalidDataException($"Configuratie op {path} kon niet gelezen worden.");
    }

    public void Save(string path) =>
        File.WriteAllText(path, JsonSerializer.Serialize(this, JsonOptions.Default));

    public void AddSourceFolder(string path)
    {
        if (!Directory.Exists(path))
            throw new DirectoryNotFoundException($"Source Folder bestaat niet: {path}");

        if (!SourceFolders.Contains(path)) SourceFolders.Add(path);
    }

    public void RemoveSourceFolder(string path)
    {
        SourceFolders.Remove(path);
        ForgetIndexed(path);
    }

    public IndexedFolder? FindIndexed(string sourceFolder) =>
        IndexedFolders.FirstOrDefault(f => f.SourceFolder == sourceFolder);

    public void RecordIndexed(string sourceFolder, string memoryId, string memoryName, string destinationName)
    {
        ForgetIndexed(sourceFolder);
        IndexedFolders.Add(new IndexedFolder
        {
            SourceFolder = sourceFolder,
            MemoryId = memoryId,
            MemoryName = memoryName,
            DestinationName = destinationName,
        });
    }

    // Re-homing a Memory to a (possibly new) Destination changes this cached
    // copy too — BuildFolderViews reads the sidebar/detail's destination
    // name from here, not from catalog.json. Deliberately doesn't touch
    // IndexedAt: that field means "photos last scanned", and picking a
    // different Destination doesn't rescan anything.
    public void UpdateIndexedDestinationName(string sourceFolder, string destinationName)
    {
        var indexed = FindIndexed(sourceFolder);
        if (indexed is not null) indexed.DestinationName = destinationName;
    }

    public void ForgetIndexed(string sourceFolder) =>
        IndexedFolders.RemoveAll(f => f.SourceFolder == sourceFolder);
}
