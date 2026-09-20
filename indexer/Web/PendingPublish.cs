using System.IO;
using System.Text.Json;
using Indexer.Catalog;

namespace Indexer.Web;

// The publish workflow's own change log. Every action that changes what's
// published (reindex, delete a photo, set a cover, remove a folder) records
// what it did here instead of deploy-nas.ps1 discovering it itself by
// scanning and diffing the whole output tree on every run — see
// deploy-nas.ps1's -PendingFilesJson. A "memory" instruction means "a
// reindex touched this Memory"; CatalogBuilder regenerates every derivative
// for a Memory unconditionally, so there's no finer-grained way to say it.
// A "file" instruction means exactly one already-known relative path (a new
// cover thumbnail, or catalog.json itself) needs publishing.
public sealed record PendingInstruction(string Scope, string? MemoryId, string? Path);

public static class PendingPublish
{
    public const string MemoryScope = "memory";
    public const string FileScope = "file";

    public static List<PendingInstruction> Load(string path) =>
        File.Exists(path)
            ? JsonSerializer.Deserialize<List<PendingInstruction>>(File.ReadAllText(path), JsonOptions.Default) ?? []
            : [];

    public static void Save(string path, List<PendingInstruction> instructions) =>
        File.WriteAllText(path, JsonSerializer.Serialize(instructions, JsonOptions.Default));

    public static List<PendingInstruction> AddMemory(List<PendingInstruction> instructions, string memoryId) =>
        instructions.Any(i => i.Scope == MemoryScope && i.MemoryId == memoryId)
            ? instructions
            : [.. instructions, new PendingInstruction(MemoryScope, memoryId, null)];

    public static List<PendingInstruction> AddFile(List<PendingInstruction> instructions, string relativePath) =>
        instructions.Any(i => i.Scope == FileScope && i.Path == relativePath)
            ? instructions
            : [.. instructions, new PendingInstruction(FileScope, null, relativePath)];

    // Turns logged intent into the concrete, deduplicated list of
    // output-relative paths deploy-nas.ps1 needs to upload — resolved
    // against the *current* catalog and media folder, not against whatever
    // was true when the instruction was logged, so two reindexes of the
    // same Memory before a publish don't need any special-casing.
    public static List<string> ResolveFiles(List<PendingInstruction> instructions, RwCatalog catalog, string mediaDir)
    {
        var files = new SortedSet<string>(StringComparer.Ordinal);

        foreach (var instruction in instructions)
        {
            if (instruction.Scope == FileScope && instruction.Path is { } path)
            {
                files.Add(path);
            }
            else if (instruction.Scope == MemoryScope && instruction.MemoryId is { } memoryId)
            {
                var memory = catalog.Memories.FirstOrDefault(m => m.Id == memoryId);
                if (memory is null || !Directory.Exists(mediaDir)) continue; // removed since logged — nothing left to publish

                foreach (var chapter in memory.Chapters)
                    foreach (var file in Directory.GetFiles(mediaDir, $"{chapter.Id}-*"))
                        files.Add("media/" + Path.GetFileName(file));
            }
        }

        return [.. files];
    }
}
