using System.IO;
using System.Text.Json;

namespace Indexer.Curation;

// Issue #19 §9: the operator's standing decisions about one Source Folder,
// not in the published catalogue, so they survive a re-run or a rebuilt
// catalogue. Keyed by cause (a camera, or "geen-opnametijd"), not by file
// list, so files added to the Source Folder later under an already-known
// cause need nothing updated here (#33's acceptance criterion).
//
// §9 originally put this file next to the Source Folder on the NAS itself,
// for two reasons: it survives a re-install, and it travels with the folder
// if it moves. In practice a NAS share holding a photo archive is often
// read-only at the folder level the operator has no reason to write to —
// this repo's own such share only grants read on Fotos — so an operator
// running the Indexer with correctly least-privileged access could never
// write it there. It now lives in a separate, dedicated Curation-folder
// instead, keyed by Memory id rather than by path, deliberately trading
// away §9's "travels with the folder" benefit for write access the operator
// controls independently of the photo archive's own permissions.
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

    public static string PathFor(string curationFolder, string memoryId) =>
        Path.Combine(curationFolder, $"{memoryId}.curation.json");
}

public sealed record AnomalyRecord(string Message, AnomalyHandling Handling, List<string> AffectedFiles);
