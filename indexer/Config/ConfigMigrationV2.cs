using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using Indexer.Catalog;

namespace Indexer.Config;

// V1 -> V2 config (#63): the folder-keyed `sourceFolders` + `indexedFolders`
// become a `memories` list. Runs after the catalogue step (#73), because each
// Memory's default date is the date that step gave it.
//
// Writing config.json without `indexedFolders` is the commit point: the step
// only runs while that key is present, so a stop at any earlier moment is
// retried from the start of this step, and the backup is never made twice.
public static class ConfigMigrationV2
{
    public const string StepName = "config v2";

    // What a V1 config.json holds that V2 replaces.
    public sealed class V1Config
    {
        public List<string> SourceFolders { get; init; } = [];
        public List<V1IndexedFolder> IndexedFolders { get; init; } = [];
    }

    public sealed class V1IndexedFolder
    {
        public required string SourceFolder { get; init; }
        public required string MemoryId { get; init; }
        public required string MemoryName { get; init; }
        public string? DestinationName { get; init; }
        public DateTimeOffset IndexedAt { get; init; }
    }

    // Null when there is no config or it is already V2 (no `indexedFolders`).
    public static V1Config? ReadV1(string configPath)
    {
        if (!File.Exists(configPath)) return null;

        var text = File.ReadAllText(configPath);
        using var doc = JsonDocument.Parse(text);
        if (!doc.RootElement.TryGetProperty("indexedFolders", out _)) return null;

        return JsonSerializer.Deserialize<V1Config>(text, JsonOptions.Default);
    }

    // Null: nothing to do. Failures are reported, not thrown, and leave config.json as it was.
    public static MigrationStepResult? Run(string configPath, string catalogPath)
    {
        var stage = "config lezen";
        try
        {
            var v1 = ReadV1(configPath);
            if (v1 is null) return null;

            stage = "back-up maken";
            var backupPath = configPath + CatalogMigrationV2.BackupSuffix;
            if (!File.Exists(backupPath)) File.Copy(configPath, backupPath);

            stage = "catalogus lezen";
            var dates = CatalogStore.Load(catalogPath).Memories.ToDictionary(m => m.Id, m => m.Date);

            stage = "Memories omzetten";
            var fallbacks = new List<string>();
            var memories = v1.IndexedFolders.Select(folder =>
            {
                DateOnly date;
                if (dates.TryGetValue(folder.MemoryId, out var catalogDate))
                {
                    date = catalogDate;
                }
                else
                {
                    date = DateOnly.FromDateTime(folder.IndexedAt.DateTime);
                    fallbacks.Add(folder.MemoryName);
                }

                return new MemoryConfig
                {
                    MemoryId = folder.MemoryId,
                    Name = folder.MemoryName,
                    DestinationName = string.IsNullOrWhiteSpace(folder.DestinationName) ? null : folder.DestinationName,
                    DefaultDate = date,
                    NeedsReindex = false,
                    IndexedAt = folder.IndexedAt,
                    SourceFolders = [folder.SourceFolder],
                };
            }).ToList();

            var indexedFolders = v1.IndexedFolders.Select(f => f.SourceFolder).ToHashSet();
            var dropped = v1.SourceFolders.Where(path => !indexedFolders.Contains(path)).ToList();

            // Through the raw JSON so every other setting survives untouched.
            stage = "config schrijven";
            var root = JsonNode.Parse(File.ReadAllText(configPath))!.AsObject();
            root.Remove("sourceFolders");
            root.Remove("indexedFolders");
            root["memories"] = JsonSerializer.SerializeToNode(memories, JsonOptions.Default);

            var tempPath = configPath + ".tmp";
            File.WriteAllText(tempPath, root.ToJsonString(JsonOptions.Default));
            File.Move(tempPath, configPath, overwrite: true);

            return new MigrationStepResult
            {
                Step = StepName,
                Succeeded = true,
                MemoryCount = memories.Count,
                Backups = [Path.GetFileName(backupPath)],
                FallbackDates = fallbacks,
                DroppedFolders = dropped,
            };
        }
        catch (Exception ex)
        {
            return new MigrationStepResult { Step = StepName, Succeeded = false, FailedAt = stage, Error = ex.Message };
        }
    }
}
