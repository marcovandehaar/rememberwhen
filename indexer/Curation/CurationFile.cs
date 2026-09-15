using System.IO;
using System.Text.Json;

namespace Indexer.Curation;

// Issue #19 §9: the operator's standing decisions about one Source Folder,
// kept as a sidecar next to it — not inside it, and not in the published
// catalogue — so they survive a re-run or a rebuilt catalogue. Keyed by
// cause (a camera, or "geen-opnametijd"), not by file list, so files added
// to the Source Folder later under an already-known cause need nothing
// updated here (#33's acceptance criterion). This ticket is the first to
// write it — a later one (Chapter boundaries, Destination name) adds
// fields, additive only, same as the catalogue contract.
public sealed class CurationFile
{
    public Dictionary<string, AnomalyRecord> Anomalies { get; init; } = [];

    public static CurationFile CreateEmpty() => new();

    public static CurationFile Load(string path)
    {
        if (!File.Exists(path)) return CreateEmpty();

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<CurationFile>(json, JsonOptions.Default) ?? CreateEmpty();
    }

    public void Save(string path) =>
        File.WriteAllText(path, JsonSerializer.Serialize(this, JsonOptions.Default));

    // "\\nas\Fotos\2010\Schotland" -> "\\nas\Fotos\2010\Schotland.curation.json" —
    // a sibling of the Source Folder, never a file inside it.
    public static string SidecarPathFor(string sourceFolder)
    {
        var normalized = Path.GetFullPath(sourceFolder).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var parent = Path.GetDirectoryName(normalized)!;
        var name = Path.GetFileName(normalized);
        return Path.Combine(parent, $"{name}.curation.json");
    }
}

public sealed record AnomalyRecord(string Message, AnomalyHandling Handling, List<string> AffectedFiles);
