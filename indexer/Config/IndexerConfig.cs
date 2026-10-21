using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

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

    // What the catalogue's date is: the operator's override, else the date the
    // last build gave the Memory.
    [JsonIgnore]
    public DateOnly EffectiveDate => DateOverride ?? DefaultDate;
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

    [JsonIgnore]
    public IEnumerable<string> SourceFolders => Memories.SelectMany(m => m.SourceFolders);

    public static IndexerConfig Load(string path)
    {
        if (!File.Exists(path)) return new IndexerConfig();

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<IndexerConfig>(json, JsonOptions.Default)
               ?? throw new InvalidDataException($"Configuratie op {path} kon niet gelezen worden.");
    }

    public void Save(string path)
    {
        File.WriteAllText(path, JsonSerializer.Serialize(this, JsonOptions.Default));
    }

    // The "+ Nieuwe Memory" of the Indexer list: a name and a first Source
    // Folder, not in the catalogue until its first index.
    public MemoryConfig AddMemory(string name, string firstSourceFolder)
    {
        name = name.Trim();
        if (name.Length == 0) throw new ArgumentException("Vul een Memory-naam in.", nameof(name));
        if (!Directory.Exists(firstSourceFolder))
            throw new DirectoryNotFoundException($"Source Folder bestaat niet: {firstSourceFolder}");

        var id = Slug.From(name);
        if (FindById(id) is not null)
            throw new InvalidOperationException($"'{name}' is al in gebruik voor een andere Memory. Kies een andere Memory-naam.");

        var memory = new MemoryConfig
        {
            MemoryId = id,
            Name = name,
            DefaultDate = DateOnly.FromDateTime(DateTime.Today),
            NeedsReindex = true,
            SourceFolders = [firstSourceFolder],
        };
        Memories.Add(memory);
        return memory;
    }

    public void RemoveMemory(string memoryId) => Memories.RemoveAll(m => m.MemoryId == memoryId);

    public void SetDateOverride(string memoryId, DateOnly? date) => GetById(memoryId).DateOverride = date;

    public void SetDestinationName(string memoryId, string? destinationName) => GetById(memoryId).DestinationName = destinationName;

    // Only the displayed name changes; the id stays (see CatalogStore.SetName).
    public void RenameMemory(string memoryId, string name) => GetById(memoryId).Name = name;

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
}
