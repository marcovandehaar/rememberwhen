using Indexer.Catalog;
using Indexer.Config;

namespace Indexer.Tests;

public class ConfigMigrationV2Tests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
    private readonly string _configPath;
    private readonly string _catalogPath;

    public ConfigMigrationV2Tests()
    {
        Directory.CreateDirectory(_root);
        _configPath = Path.Combine(_root, "config.json");
        _catalogPath = Path.Combine(_root, "catalog.json");
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private const string V1Config = """
        {
          "sourceFolders": [ "C:\\Photos\\Zeeland 2016", "C:\\Photos\\Nog niet" ],
          "indexedFolders": [
            { "sourceFolder": "C:\\Photos\\Zeeland 2016", "memoryId": "zeeland-2016", "memoryName": "Zeeland 2016",
              "destinationName": "Zeeland", "indexedAt": "2024-03-05T12:00:00+00:00" },
            { "sourceFolder": "C:\\Photos\\Verdwenen", "memoryId": "verdwenen", "memoryName": "Verdwenen",
              "destinationName": "Ergens", "indexedAt": "2023-01-02T08:00:00+00:00" }
          ],
          "gazetteerPath": "gazetteer.json",
          "outputFolder": "uitvoer",
          "sourceFoldersRoot": "\\\\nas\\Fotos"
        }
        """;

    private void WriteCatalogWith(params (string Id, DateOnly Date)[] memories) =>
        CatalogStore.Save(new RwCatalog
        {
            Memories = [.. memories.Select(m => new RwMemory
            {
                Id = m.Id,
                Name = m.Id,
                Date = m.Date,
                CoverImage = "media/c.jpg",
                Destination = new RwDestination("Zeeland", new Coordinate(51.5, 3.8)),
            })],
        }, _catalogPath);

    private MigrationStepResult? RunWithZeelandCatalogue()
    {
        File.WriteAllText(_configPath, V1Config);
        WriteCatalogWith(("zeeland-2016", new DateOnly(2016, 7, 1)));
        return ConfigMigrationV2.Run(_configPath, _catalogPath);
    }

    [Fact]
    public void Turns_indexed_folders_into_memories_with_the_catalogue_dates_and_keeps_other_settings()
    {
        var result = RunWithZeelandCatalogue();

        Assert.True(result!.Succeeded);
        var config = IndexerConfig.Load(_configPath);
        var zeeland = config.Memories.Single(m => m.MemoryId == "zeeland-2016");
        Assert.Equal("Zeeland 2016", zeeland.Name);
        Assert.Equal("Zeeland", zeeland.DestinationName);
        Assert.Equal(new DateOnly(2016, 7, 1), zeeland.DefaultDate);
        Assert.False(zeeland.NeedsReindex);
        Assert.Equal(["C:\\Photos\\Zeeland 2016"], zeeland.SourceFolders);
        Assert.Equal("uitvoer", config.OutputFolder);
        Assert.Equal("\\\\nas\\Fotos", config.SourceFoldersRoot);
        var text = File.ReadAllText(_configPath);
        Assert.DoesNotContain("indexedFolders", text);
        Assert.DoesNotContain("\"sourceFolders\": [ \"C:", text);
    }

    [Fact]
    public void A_memory_missing_from_the_catalogue_falls_back_to_its_indexed_date_and_is_reported()
    {
        var result = RunWithZeelandCatalogue();

        var verdwenen = IndexerConfig.Load(_configPath).Memories.Single(m => m.MemoryId == "verdwenen");
        Assert.Equal(new DateOnly(2023, 1, 2), verdwenen.DefaultDate);
        Assert.Equal(["Verdwenen"], result!.FallbackDates);
    }

    [Fact]
    public void Folders_that_were_never_indexed_are_dropped_and_listed()
    {
        var result = RunWithZeelandCatalogue();

        Assert.Equal(["C:\\Photos\\Nog niet"], result!.DroppedFolders);
        Assert.DoesNotContain("C:\\Photos\\Nog niet", IndexerConfig.Load(_configPath).SourceFolders);
    }

    [Fact]
    public void Backs_up_once_and_a_second_start_does_nothing()
    {
        var first = RunWithZeelandCatalogue();
        var migrated = File.ReadAllText(_configPath);
        var second = ConfigMigrationV2.Run(_configPath, _catalogPath);

        Assert.Equal(["config.json.pre-v2.bak"], first!.Backups);
        Assert.Equal(V1Config, File.ReadAllText(_configPath + ".pre-v2.bak"));
        Assert.Null(second);
        Assert.Equal(migrated, File.ReadAllText(_configPath));
    }

    [Fact]
    public void A_restart_after_a_stop_before_the_commit_point_completes_without_a_second_backup()
    {
        // The stop happened after the backup but before config.json was rewritten.
        File.WriteAllText(_configPath + ".pre-v2.bak", V1Config);

        var result = RunWithZeelandCatalogue();

        Assert.True(result!.Succeeded);
        Assert.Equal(V1Config, File.ReadAllText(_configPath + ".pre-v2.bak"));
        Assert.DoesNotContain("indexedFolders", File.ReadAllText(_configPath));
    }

    [Fact]
    public void A_fresh_config_without_indexed_folders_is_left_alone()
    {
        File.WriteAllText(_configPath, """{ "memories": [], "outputFolder": "output" }""");

        Assert.Null(ConfigMigrationV2.Run(_configPath, _catalogPath));
        Assert.False(File.Exists(_configPath + ".pre-v2.bak"));
    }

    [Fact]
    public void A_broken_config_is_reported_and_left_intact()
    {
        File.WriteAllText(_configPath, "{ not json");

        var result = ConfigMigrationV2.Run(_configPath, _catalogPath);

        Assert.False(result!.Succeeded);
        Assert.Equal("config lezen", result.FailedAt);
        Assert.Equal("{ not json", File.ReadAllText(_configPath));
    }

    [Fact]
    public void The_runner_reports_both_steps_in_order_and_stops_at_the_first_failure()
    {
        var catalogue = new MigrationStepResult { Step = CatalogMigrationV2.StepName, Succeeded = true, MemoryCount = 1 };
        var reportPath = Path.Combine(_root, MigrationRunner.ReportFileName);
        File.WriteAllText(_configPath, V1Config);
        WriteCatalogWith(("zeeland-2016", new DateOnly(2016, 7, 1)));

        var report = MigrationRunner.Run(reportPath, TextWriter.Null, () => catalogue, () => ConfigMigrationV2.Run(_configPath, _catalogPath));

        Assert.Equal([CatalogMigrationV2.StepName, ConfigMigrationV2.StepName], report!.Steps.Select(s => s.Step));

        var failing = new MigrationStepResult { Step = "x", Succeeded = false, FailedAt = "y", Error = "z" };
        var stopped = MigrationRunner.Run(reportPath, TextWriter.Null, () => failing, () => throw new InvalidOperationException("must not run"));
        Assert.Single(stopped!.Steps);
    }

    [Fact]
    public void Reads_the_v1_indexed_dates_for_the_catalogue_step_and_nothing_from_a_v2_config()
    {
        File.WriteAllText(_configPath, V1Config);
        Assert.Equal(2, ConfigMigrationV2.ReadV1(_configPath)!.IndexedFolders.Count);

        File.WriteAllText(_configPath, """{ "memories": [] }""");
        Assert.Null(ConfigMigrationV2.ReadV1(_configPath));
    }
}
