using Indexer.Curation;

namespace Indexer.Tests;

public class CurationFileTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public void Loading_a_missing_file_returns_an_empty_curation_rather_than_throwing()
    {
        var path = Path.Combine(_root, "does-not-exist.curation.json");

        var curation = CurationFile.Load(path);

        Assert.Empty(curation.Anomalies);
    }

    [Fact]
    public void Anomalies_round_trip_keyed_by_cause()
    {
        Directory.CreateDirectory(_root);
        var path = Path.Combine(_root, "trip.curation.json");

        var curation = CurationFile.CreateEmpty();
        curation.Anomalies["NIKON D50"] = new AnomalyRecord(
            Message: "3 bestand(en) van NIKON D50 ...",
            Handling: AnomalyHandling.UseMtime,
            AffectedFiles: ["nikon1.jpg", "nikon2.jpg", "nikon3.jpg"]);
        curation.Save(path);

        var reloaded = CurationFile.Load(path);

        var anomaly = reloaded.Anomalies["NIKON D50"];
        Assert.Equal(AnomalyHandling.UseMtime, anomaly.Handling);
        Assert.Equal(3, anomaly.AffectedFiles.Count);
    }

    [Fact]
    public void The_curation_path_sits_in_the_curation_folder_keyed_by_memory_id()
    {
        var curationFolder = Path.Combine(_root, "curation");

        var path = CurationFile.PathFor(curationFolder, "schotland-2010");

        Assert.Equal(curationFolder, Path.GetDirectoryName(path));
        Assert.Equal("schotland-2010.curation.json", Path.GetFileName(path));
    }
}
