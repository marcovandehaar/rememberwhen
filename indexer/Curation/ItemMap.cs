using System.IO;
using System.Text.Json;

namespace Indexer.Curation;

// Media Item id -> the source file it was built from. Written by every build
// into the Curation-folder as <memoryId>.items.json, so the review screen,
// which only knows an id, can tie an edit to a source file. It stays out of
// catalog.json on purpose (ADR 0008: no NAS path in a file served to every
// device), is rewritten on every build and is never edited by hand.
public static class ItemMap
{
    public static string PathFor(string curationFolder, string memoryId) =>
        Path.Combine(curationFolder, $"{memoryId}.items.json");

    /// <summary>Null when the Memory has not been built since V2 introduced the map.</summary>
    public static Dictionary<string, string>? Load(string path)
    {
        if (!File.Exists(path)) return null;
        return JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(path), JsonOptions.Default);
    }

    public static void Save(string path, Dictionary<string, string> map)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(map, JsonOptions.Default));
    }
}
