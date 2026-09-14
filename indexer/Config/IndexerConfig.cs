using System.IO;
using System.Text.Json;

namespace Indexer.Config;

// The one configuration file docs/v1-build-spec.md's Configuratie section
// calls for (#22, #37): Source Folders, the Gazetteer path, and the output
// location. Starts empty on disk — unlike the Gazetteer, there is nothing
// to seed by hand before the settings UI can be used.
public sealed class IndexerConfig
{
    public List<string> SourceFolders { get; set; } = [];
    public string GazetteerPath { get; set; } = "gazetteer.json";
    public string OutputFolder { get; set; } = "output";

    public static IndexerConfig Load(string path)
    {
        if (!File.Exists(path)) return new IndexerConfig();

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<IndexerConfig>(json, JsonOptions.Default)
               ?? throw new InvalidDataException($"Configuratie op {path} kon niet gelezen worden.");
    }

    public void Save(string path) =>
        File.WriteAllText(path, JsonSerializer.Serialize(this, JsonOptions.Default));

    public void AddSourceFolder(string path)
    {
        if (!Directory.Exists(path))
            throw new DirectoryNotFoundException($"Source Folder bestaat niet: {path}");

        if (!SourceFolders.Contains(path)) SourceFolders.Add(path);
    }

    public void RemoveSourceFolder(string path) => SourceFolders.Remove(path);
}
