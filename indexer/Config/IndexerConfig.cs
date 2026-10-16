using System.IO;
using System.Text.Json;

namespace Indexer.Config;

// The one configuration file docs/v1-build-spec.md's Configuratie section
// calls for (#22, #37): the Memories with their Source Folders, the
// Gazetteer path, and the output location. Starts empty on disk — unlike the
// Gazetteer, there is nothing to seed by hand before the settings UI can be
// used.

// V2 (#63) keys the config by Memory instead of by folder. A Source Folder
// exists only inside a Memory; a Memory may have several (#64), and the same
// folder may feed several Memories (each indexes it on its own). The settings UI offers "reindex" and
// "remove" on a Memory that is already published, rather than only ever
// offering a first-time index.
public sealed class MemoryConfig
{
    public required string MemoryId { get; set; }
    public required string Name { get; set; }

    // Null: the Memory is not a Trip.
    public string? DestinationName { get; set; }

    // Set by the operator; wins over DefaultDate (arrives with the Indexer list, #65).
    public DateOnly? DateOverride { get; set; }

    // The date the last build gave the Memory (its earliest effective capture day).
    public required DateOnly DefaultDate { get; set; }

    // The Source Folders changed since the last build, so the catalogue is stale.
    public bool NeedsReindex { get; set; }

    // When the photos were last scanned; null for a folder that was added but never indexed.
    public DateTimeOffset? IndexedAt { get; set; }

    public List<string> SourceFolders { get; set; } = [];
}

public sealed class IndexerConfig
{
    public List<MemoryConfig> Memories { get; set; } = [];
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

    // Empty means "not configured" — an HDR video is then published
    // unchanged (with a log line) rather than blocking the run (#48).
    // Full path to ffmpeg.exe, not just a bare name: the indexing machine
    // running this isn't guaranteed to have it on PATH.
    public string FfmpegPath { get; set; } = "";

    public IEnumerable<string> SourceFolders => Memories.SelectMany(m => m.SourceFolders);

    public static IndexerConfig Load(string path)
    {
        if (!File.Exists(path)) return new IndexerConfig();

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<IndexerConfig>(json, JsonOptions.Default)
               ?? throw new InvalidDataException($"Configuratie op {path} kon niet gelezen worden.");
    }

    // A config that still has its V1 folders (the migration failed or hasn't
    // run) must not be overwritten: this model doesn't read them, so saving
    // would silently erase the folder list and pass the migration's commit point.
    public void Save(string path)
    {
        if (ConfigMigrationV2.ReadV1(path) is not null)
            throw new InvalidOperationException(
                $"{path} is nog niet gemigreerd naar V2; herstel de migratie (zie de melding in de Indexer) voordat je instellingen opslaat.");

        File.WriteAllText(path, JsonSerializer.Serialize(this, JsonOptions.Default));
    }

    public MemoryConfig? FindByFolder(string sourceFolder) =>
        Memories.FirstOrDefault(m => m.SourceFolders.Contains(sourceFolder));

    // A folder added but not yet indexed is a Memory the catalogue doesn't
    // know yet (IndexedAt null), named after the folder until the index form
    // gives it its real name.
    public void AddSourceFolder(string path)
    {
        if (!Directory.Exists(path))
            throw new DirectoryNotFoundException($"Source Folder bestaat niet: {path}");

        if (FindByFolder(path) is not null) return;

        var name = Path.GetFileName(path.TrimEnd('\\', '/'));
        Memories.Add(new MemoryConfig
        {
            MemoryId = Slug.From(name),
            Name = name,
            DefaultDate = DateOnly.FromDateTime(DateTime.Today),
            NeedsReindex = true,
            SourceFolders = [path],
        });
    }

    // Drops every Memory built from this folder.
    public void RemoveSourceFolder(string path) =>
        Memories.RemoveAll(m => m.SourceFolders.Contains(path));

    public MemoryConfig? FindById(string memoryId) =>
        Memories.FirstOrDefault(m => m.MemoryId == memoryId);

    private MemoryConfig GetById(string memoryId) =>
        FindById(memoryId) ?? throw new KeyNotFoundException($"Memory '{memoryId}' bestaat niet.");

    // Only the configuration changes: nothing is rebuilt until the operator
    // reindexes, which is what NeedsReindex flags. No uniqueness check across
    // Memories — the same folder may feed several.
    public void AddSourceFolderToMemory(string memoryId, string path)
    {
        var memory = GetById(memoryId);
        if (!Directory.Exists(path))
            throw new DirectoryNotFoundException($"Source Folder bestaat niet: {path}");
        if (memory.SourceFolders.Contains(path)) return;

        memory.SourceFolders.Add(path);
        memory.NeedsReindex = true;
    }

    public void RemoveSourceFolderFromMemory(string memoryId, string path)
    {
        var memory = GetById(memoryId);
        if (!memory.SourceFolders.Contains(path)) return;
        if (memory.SourceFolders.Count == 1)
            throw new InvalidOperationException("Dit is de laatste Source Folder van deze Memory; die kan niet worden verwijderd.");

        memory.SourceFolders.Remove(path);
        memory.NeedsReindex = true;
    }

    // A reindex builds the Memory from its current folder list, so it is the
    // Memory — not a folder, which several Memories may share — that records
    // the result: the date its earliest photo gave it, and that it is fresh again.
    public void RecordMemoryIndexed(string memoryId, string newMemoryId, string memoryName, string? destinationName, DateOnly defaultDate)
    {
        var memory = GetById(memoryId);
        memory.MemoryId = newMemoryId;
        memory.Name = memoryName;
        memory.DestinationName = destinationName;
        memory.DefaultDate = defaultDate;
        memory.NeedsReindex = false;
        memory.IndexedAt = DateTimeOffset.UtcNow;
    }

    // Only a Memory that has been indexed: a folder that was just added has
    // nothing published to reindex or remove yet.
    public MemoryConfig? FindIndexed(string sourceFolder) =>
        Memories.FirstOrDefault(m => m.IndexedAt is not null && m.SourceFolders.Contains(sourceFolder));

    public void RecordIndexed(string sourceFolder, string memoryId, string memoryName, string? destinationName, DateOnly defaultDate)
    {
        var memory = FindByFolder(sourceFolder);
        if (memory is null)
        {
            memory = new MemoryConfig { MemoryId = memoryId, Name = memoryName, DefaultDate = defaultDate, SourceFolders = [sourceFolder] };
            Memories.Add(memory);
        }

        memory.MemoryId = memoryId;
        memory.Name = memoryName;
        memory.DestinationName = destinationName;
        memory.DefaultDate = defaultDate;
        memory.NeedsReindex = false;
        memory.IndexedAt = DateTimeOffset.UtcNow;
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

    // The Memory's id stays as it was (see CatalogStore.SetName).
    public void UpdateIndexedMemoryName(string sourceFolder, string memoryName)
    {
        var indexed = FindIndexed(sourceFolder);
        if (indexed is not null) indexed.Name = memoryName;
    }
}
