namespace Indexer.Curation;

public static class ItemEdits
{
    /// <summary>
    /// Records an edit to one Media Item in the Memory's Curation file, by its source file. False
    /// when the edit could not be made durable: the Memory has no item map yet (not built since V2),
    /// or the id is not in it. The caller then only patches the catalogue, as V1 did.
    /// </summary>
    public static bool TryRecord(string curationFolder, string memoryId, string itemId, Action<CurationFile, string> edit)
    {
        var map = ItemMap.Load(ItemMap.PathFor(curationFolder, memoryId));
        if (map is null || !map.TryGetValue(itemId, out var sourcePath)) return false;

        var path = CurationFile.PathFor(curationFolder, memoryId);
        var curation = CurationFile.Load(path);
        edit(curation, sourcePath);
        Directory.CreateDirectory(curationFolder);
        curation.Save(path);
        return true;
    }
}
