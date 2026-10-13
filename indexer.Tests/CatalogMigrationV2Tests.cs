using Indexer.Catalog;
using Indexer.Web;

namespace Indexer.Tests;

public class CatalogMigrationV2Tests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
    private readonly string _catalogPath;
    private readonly string _pendingPath;
    private readonly string _reportPath;

    private static readonly Dictionary<string, DateTimeOffset> NoFolders = [];

    public CatalogMigrationV2Tests()
    {
        Directory.CreateDirectory(_root);
        _catalogPath = Path.Combine(_root, "catalog.json");
        _pendingPath = Path.Combine(_root, "pending-publish.json");
        _reportPath = Path.Combine(_root, MigrationRunner.ReportFileName);
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private const string V1Catalog = """
        {
          "schemaVersion": 1,
          "memories": [
            {
              "id": "zeeland-2016",
              "name": "Zeeland 2016",
              "destinationName": "Zeeland",
              "destinationCoordinate": { "lat": 51.5, "lon": 3.8 },
              "coverImage": "media/a-thumb.jpg",
              "chapters": [
                { "id": "zeeland-2016-c1", "mediaItems": [
                  { "id": "i2", "mediaRef": "media/i2.jpg", "type": "photo", "capturedAt": "2016-07-02T09:00:00+02:00",
                    "storyRect": { "x": 0, "y": 0, "width": 1, "height": 1 }, "shotDuration": 4 },
                  { "id": "i1", "mediaRef": "media/i1.jpg", "type": "photo", "capturedAt": "2016-07-01T23:30:00+02:00",
                    "storyRect": { "x": 0, "y": 0, "width": 1, "height": 1 }, "shotDuration": 4 }
                ] }
              ]
            }
          ]
        }
        """;

    private MigrationStepResult? Run(IReadOnlyDictionary<string, DateTimeOffset>? folders = null) =>
        CatalogMigrationV2.Run(_catalogPath, _pendingPath, folders ?? NoFolders);

    [Fact]
    public void Migrates_destination_and_date_and_keeps_the_rest()
    {
        File.WriteAllText(_catalogPath, V1Catalog);

        var result = Run();

        Assert.True(result!.Succeeded);
        var catalog = CatalogStore.Load(_catalogPath);
        Assert.Equal(2, catalog.SchemaVersion);
        var memory = Assert.Single(catalog.Memories);
        Assert.Equal(new RwDestination("Zeeland", new Coordinate(51.5, 3.8)), memory.Destination);
        Assert.Equal(new DateOnly(2016, 7, 1), memory.Date);
        Assert.Equal("media/a-thumb.jpg", memory.CoverImage);
        Assert.Equal(["i2", "i1"], memory.Chapters.Single().MediaItems.Select(i => i.Id));
        Assert.DoesNotContain("destinationName", File.ReadAllText(_catalogPath));
    }

    [Fact]
    public void Backs_up_once_and_a_second_run_changes_nothing()
    {
        File.WriteAllText(_catalogPath, V1Catalog);

        var first = Run();
        var migrated = File.ReadAllText(_catalogPath);
        var second = Run();

        Assert.Equal([ "catalog.json.pre-v2.bak" ], first!.Backups);
        Assert.Equal(V1Catalog, File.ReadAllText(_catalogPath + ".pre-v2.bak"));
        Assert.Null(second);
        Assert.Equal(migrated, File.ReadAllText(_catalogPath));
    }

    [Fact]
    public void Never_overwrites_an_existing_backup()
    {
        File.WriteAllText(_catalogPath, V1Catalog);
        File.WriteAllText(_catalogPath + ".pre-v2.bak", "original");

        Run();

        Assert.Equal("original", File.ReadAllText(_catalogPath + ".pre-v2.bak"));
    }

    [Fact]
    public void Does_nothing_without_a_catalogue()
    {
        Assert.Null(Run());
        Assert.False(File.Exists(_pendingPath));
    }

    [Fact]
    public void A_memory_without_capture_times_falls_back_to_its_folders_indexed_date_and_is_reported()
    {
        File.WriteAllText(_catalogPath, V1Catalog.Replace("\"capturedAt\"", "\"x\""));
        var folders = new Dictionary<string, DateTimeOffset> { ["zeeland-2016"] = new(2024, 3, 5, 12, 0, 0, TimeSpan.Zero) };

        var result = Run(folders);

        Assert.Equal(new DateOnly(2024, 3, 5), CatalogStore.Load(_catalogPath).Memories[0].Date);
        Assert.Equal(["Zeeland 2016"], result!.FallbackDates);
    }

    [Fact]
    public void Marks_the_catalogue_as_pending_publish()
    {
        File.WriteAllText(_catalogPath, V1Catalog);

        Run();

        var pending = PendingPublish.Load(_pendingPath);
        Assert.Contains(pending, p => p.Scope == PendingPublish.FileScope && p.Path == "catalog.json");
    }

    [Fact]
    public void A_broken_catalogue_is_reported_and_left_intact_and_a_restart_after_the_fix_completes()
    {
        File.WriteAllText(_catalogPath, "{ not json");

        var failed = Run();

        Assert.False(failed!.Succeeded);
        Assert.Equal("catalogus lezen", failed.FailedAt);
        Assert.False(string.IsNullOrEmpty(failed.Error));
        Assert.Equal("{ not json", File.ReadAllText(_catalogPath));
        Assert.False(File.Exists(_catalogPath + ".pre-v2.bak"));

        File.WriteAllText(_catalogPath, V1Catalog);
        Assert.True(Run()!.Succeeded);
    }

    [Fact]
    public void The_runner_writes_the_report_and_the_console_lines_and_stays_quiet_when_nothing_ran()
    {
        File.WriteAllText(_catalogPath, V1Catalog);
        var console = new StringWriter();

        var report = MigrationRunner.Run(_reportPath, console, () => Run());

        Assert.False(report!.Failed);
        Assert.Equal(1, MigrationReport.Load(_reportPath)!.Steps.Single().MemoryCount);
        Assert.Contains("catalog.json.pre-v2.bak", console.ToString());

        File.Delete(_reportPath);
        Assert.Null(MigrationRunner.Run(_reportPath, console, () => Run()));
        Assert.False(File.Exists(_reportPath));
    }

    [Fact]
    public void The_runner_reports_a_failure_and_does_not_throw()
    {
        File.WriteAllText(_catalogPath, "{ not json");
        var console = new StringWriter();

        var report = MigrationRunner.Run(_reportPath, console, () => Run());

        Assert.True(report!.Failed);
        Assert.True(MigrationReport.Load(_reportPath)!.Failed);
        Assert.Contains("herstart de Indexer", console.ToString());
    }
}
