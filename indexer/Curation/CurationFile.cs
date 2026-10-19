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
//
// V2 (#66) adds the operator's edits to the photos of the Memory: which source
// files were removed, which one is the chosen cover, and how each was
// rotated. They are keyed by the full source path, never by Media Item id:
// an id encodes the item's position in the sorted sequence, so it shifts when
// a Source Folder is added. Every build reapplies them (ADR 0008).
public sealed class CurationFile
{
    public Dictionary<string, AnomalyRecord> Anomalies { get; init; } = [];

    // Source files the operator took out of the Memory.
    public HashSet<string> RemovedFiles { get; init; } = [];

    // The source file the operator chose as the cover; null = the earliest photo.
    public string? CoverFile { get; set; }

    // Source file -> clockwise degrees (90, 180 or 270).
    public Dictionary<string, int> Rotations { get; init; } = [];

    public bool IsEmpty => Anomalies.Count == 0 && RemovedFiles.Count == 0 && CoverFile is null && Rotations.Count == 0;

    public void RemoveFile(string sourcePath) => RemovedFiles.Add(sourcePath);

    public void SetCover(string sourcePath) => CoverFile = sourcePath;

    // Quarter turns add up; a full turn is no edit at all.
    public void Rotate(string sourcePath)
    {
        var degrees = (Rotations.GetValueOrDefault(sourcePath) + 90) % 360;
        if (degrees == 0) Rotations.Remove(sourcePath);
        else Rotations[sourcePath] = degrees;
    }

    // An edit whose file has disappeared from the Source Folders (moved,
    // renamed, deleted) is dropped: the source path is the identity, and
    // fingerprinting files to follow a rename is out of scope (ADR 0008).
    public int DropMissing(Func<string, bool> exists)
    {
        var dropped = RemovedFiles.RemoveWhere(path => !exists(path));
        foreach (var path in Rotations.Keys.Where(path => !exists(path)).ToList())
        {
            Rotations.Remove(path);
            dropped++;
        }
        if (CoverFile is not null && !exists(CoverFile))
        {
            CoverFile = null;
            dropped++;
        }
        return dropped;
    }

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

    // A reindex under a new name re-keys the Memory's id: its curation moves
    // with it, so the edits survive. A curation file the new id already has
    // wins. The old item map is just left to rot; the next build writes a
    // new one under the new id.
    public static void Rekey(string curationFolder, string oldMemoryId, string newMemoryId)
    {
        if (oldMemoryId == newMemoryId) return;

        var from = PathFor(curationFolder, oldMemoryId);
        var to = PathFor(curationFolder, newMemoryId);
        if (File.Exists(from))
        {
            if (File.Exists(to)) File.Delete(from);
            else File.Move(from, to);
        }

        var oldMap = ItemMap.PathFor(curationFolder, oldMemoryId);
        if (File.Exists(oldMap)) File.Delete(oldMap);
    }
}

public sealed record AnomalyRecord(string Message, AnomalyHandling Handling, List<string> AffectedFiles);
