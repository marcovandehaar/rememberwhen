using System.IO;
using System.Text.Json;
using Indexer.Web;

namespace Indexer.Catalog;

// V1 -> V2 (#73): destinationName + destinationCoordinate become a nested
// Destination, and every Memory gets a date. Works on the catalogue alone —
// no NAS access, no reindex — so the date is the earliest capturedAt already
// in it (the camera-clock correction isn't recoverable from here; a reindex
// applies it).
public static class CatalogMigrationV2
{
    public const string StepName = "catalogus v2";
    public const string BackupSuffix = ".pre-v2.bak";

    // Null: nothing to do (no catalogue yet, or already at schemaVersion 2).
    // Failures are reported, not thrown, and leave catalog.json as it was.
    public static MigrationStepResult? Run(
        string catalogPath,
        string pendingPublishPath,
        IReadOnlyDictionary<string, DateTimeOffset> indexedAtByMemoryId)
    {
        if (!File.Exists(catalogPath)) return null;

        var stage = "catalogus lezen";
        try
        {
            lock (CatalogStore.Gate)
            {
                var text = File.ReadAllText(catalogPath);
                using (var doc = JsonDocument.Parse(text))
                {
                    var version = doc.RootElement.TryGetProperty("schemaVersion", out var v) ? v.GetInt32() : 1;
                    if (version >= RwCatalog.CurrentSchemaVersion) return null;
                }
                var v1 = JsonSerializer.Deserialize<V1Catalog>(text, JsonOptions.Default)
                         ?? throw new InvalidDataException("Catalogus is leeg.");

                // Only after the file parsed: a backup of a corrupt file
                // would never be overwritten, and so would hide the real original.
                stage = "back-up maken";
                var backupPath = catalogPath + BackupSuffix;
                if (!File.Exists(backupPath)) File.Copy(catalogPath, backupPath);

                stage = "Memories omzetten";
                var fileDate = DateOnly.FromDateTime(File.GetLastWriteTime(catalogPath));
                var fallbacks = new List<string>();
                var memories = v1.Memories.Select(m =>
                {
                    var earliest = m.Chapters.SelectMany(c => c.MediaItems)
                        .Where(i => i.CapturedAt.HasValue).Select(i => i.CapturedAt!.Value)
                        .Cast<DateTimeOffset?>().Min();
                    DateOnly date;
                    if (earliest is { } captured)
                    {
                        date = DateOnly.FromDateTime(captured.DateTime);
                    }
                    else
                    {
                        date = indexedAtByMemoryId.TryGetValue(m.Id, out var indexedAt)
                            ? DateOnly.FromDateTime(indexedAt.DateTime)
                            : fileDate;
                        fallbacks.Add(m.Name);
                    }

                    return new RwMemory
                    {
                        Id = m.Id,
                        Name = m.Name,
                        Destination = new RwDestination(m.DestinationName, m.DestinationCoordinate),
                        Date = date,
                        CoverImage = m.CoverImage,
                        Chapters = m.Chapters,
                    };
                }).ToList();

                stage = "catalogus schrijven";
                var tempPath = catalogPath + ".tmp";
                File.WriteAllText(tempPath, JsonSerializer.Serialize(new RwCatalog { Memories = memories }, JsonOptions.Default));
                File.Move(tempPath, catalogPath, overwrite: true);

                stage = "publicatie markeren";
                PendingPublish.Save(pendingPublishPath,
                    PendingPublish.AddFile(PendingPublish.Load(pendingPublishPath), "catalog.json"));

                return new MigrationStepResult
                {
                    Step = StepName,
                    Succeeded = true,
                    MemoryCount = memories.Count,
                    Backups = [Path.GetFileName(backupPath)],
                    FallbackDates = fallbacks,
                };
            }
        }
        // Any failure, not just the expected ones: the Indexer must start either way.
        catch (Exception ex)
        {
            return new MigrationStepResult { Step = StepName, Succeeded = false, FailedAt = stage, Error = ex.Message };
        }
    }

    private sealed class V1Catalog
    {
        public List<V1Memory> Memories { get; init; } = [];
    }

    private sealed class V1Memory
    {
        public required string Id { get; init; }
        public required string Name { get; init; }
        public required string DestinationName { get; init; }
        public required Coordinate DestinationCoordinate { get; init; }
        public required string CoverImage { get; init; }
        public List<RwChapter> Chapters { get; init; } = [];
    }
}
