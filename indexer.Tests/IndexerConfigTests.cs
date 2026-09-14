using Indexer.Config;

namespace Indexer.Tests;

public class IndexerConfigTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public void Loading_a_missing_file_returns_an_empty_config_rather_than_throwing()
    {
        var config = IndexerConfig.Load(Path.Combine(_root, "config.json"));

        Assert.Empty(config.SourceFolders);
    }

    [Fact]
    public void Round_trips_through_save_and_load()
    {
        var path = Path.Combine(_root, "config.json");
        Directory.CreateDirectory(_root);
        var config = new IndexerConfig
        {
            SourceFolders = ["C:\\Photos\\Schotland 2010"],
            GazetteerPath = "gazetteer.json",
            OutputFolder = "output",
            SourceFoldersRoot = "\\\\vandehaarnas\\Fotos",
        };

        config.Save(path);
        var reloaded = IndexerConfig.Load(path);

        Assert.Equal(config.SourceFolders, reloaded.SourceFolders);
        Assert.Equal(config.GazetteerPath, reloaded.GazetteerPath);
        Assert.Equal(config.OutputFolder, reloaded.OutputFolder);
        Assert.Equal(config.SourceFoldersRoot, reloaded.SourceFoldersRoot);
    }

    [Fact]
    public void Adding_a_source_folder_that_exists_appends_it()
    {
        Directory.CreateDirectory(_root);
        var folder = Path.Combine(_root, "Schotland 2010");
        Directory.CreateDirectory(folder);
        var config = new IndexerConfig();

        config.AddSourceFolder(folder);

        Assert.Contains(folder, config.SourceFolders);
    }

    [Fact]
    public void Adding_a_source_folder_that_does_not_exist_throws_a_clear_error()
    {
        var config = new IndexerConfig();
        var missing = Path.Combine(_root, "Does Not Exist");

        var ex = Assert.Throws<DirectoryNotFoundException>(() => config.AddSourceFolder(missing));
        Assert.Contains(missing, ex.Message);
        Assert.Empty(config.SourceFolders);
    }

    [Fact]
    public void Adding_the_same_source_folder_twice_is_a_no_op()
    {
        Directory.CreateDirectory(_root);
        var config = new IndexerConfig();

        config.AddSourceFolder(_root);
        config.AddSourceFolder(_root);

        Assert.Single(config.SourceFolders);
    }

    [Fact]
    public void Removing_a_source_folder_drops_it_even_if_it_no_longer_exists_on_disk()
    {
        var config = new IndexerConfig { SourceFolders = ["C:\\Gone"] };

        config.RemoveSourceFolder("C:\\Gone");

        Assert.Empty(config.SourceFolders);
    }

    [Fact]
    public void Recording_an_indexed_folder_makes_it_findable()
    {
        var config = new IndexerConfig();

        config.RecordIndexed("C:\\Photos\\Schotland 2010", "schotland-2010", "Schotland 2010", "Schotland");

        var indexed = config.FindIndexed("C:\\Photos\\Schotland 2010");
        Assert.NotNull(indexed);
        Assert.Equal("schotland-2010", indexed!.MemoryId);
        Assert.Equal("Schotland 2010", indexed.MemoryName);
        Assert.Equal("Schotland", indexed.DestinationName);
    }

    [Fact]
    public void Recording_an_indexed_folder_twice_replaces_the_previous_record()
    {
        var config = new IndexerConfig();
        config.RecordIndexed("C:\\Photos\\X", "x-2010", "X 2010", "X");

        config.RecordIndexed("C:\\Photos\\X", "x-2011", "X 2011", "X");

        var indexed = config.FindIndexed("C:\\Photos\\X");
        Assert.Equal("x-2011", indexed!.MemoryId);
        Assert.Single(config.IndexedFolders);
    }

    [Fact]
    public void An_unindexed_folder_is_not_found()
    {
        var config = new IndexerConfig();

        Assert.Null(config.FindIndexed("C:\\Photos\\Never Indexed"));
    }

    [Fact]
    public void Removing_a_source_folder_also_forgets_its_indexed_record()
    {
        var config = new IndexerConfig { SourceFolders = ["C:\\Photos\\X"] };
        config.RecordIndexed("C:\\Photos\\X", "x-2010", "X 2010", "X");

        config.RemoveSourceFolder("C:\\Photos\\X");

        Assert.Null(config.FindIndexed("C:\\Photos\\X"));
    }

    [Fact]
    public void Indexed_records_round_trip_through_save_and_load()
    {
        var path = Path.Combine(_root, "config.json");
        Directory.CreateDirectory(_root);
        var config = new IndexerConfig();
        config.RecordIndexed("C:\\Photos\\X", "x-2010", "X 2010", "X");

        config.Save(path);
        var reloaded = IndexerConfig.Load(path);

        var indexed = reloaded.FindIndexed("C:\\Photos\\X");
        Assert.NotNull(indexed);
        Assert.Equal("x-2010", indexed!.MemoryId);
    }
}
