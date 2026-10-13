using Indexer.Config;

namespace Indexer.Tests;

public class IndexerConfigTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
    private static readonly DateOnly Day = new(2010, 8, 1);

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public void Loading_a_missing_file_returns_an_empty_config_rather_than_throwing()
    {
        var config = IndexerConfig.Load(Path.Combine(_root, "config.json"));

        Assert.Empty(config.Memories);
        Assert.Empty(config.SourceFolders);
    }

    [Fact]
    public void Round_trips_through_save_and_load()
    {
        var path = Path.Combine(_root, "config.json");
        Directory.CreateDirectory(_root);
        var config = new IndexerConfig
        {
            GazetteerPath = "gazetteer.json",
            OutputFolder = "output",
            SourceFoldersRoot = "\\\\vandehaarnas\\Fotos",
        };
        config.RecordIndexed("C:\\Photos\\Schotland 2010", "schotland-2010", "Schotland 2010", "Schotland", Day);

        config.Save(path);
        var reloaded = IndexerConfig.Load(path);

        Assert.Equal(config.GazetteerPath, reloaded.GazetteerPath);
        Assert.Equal(config.OutputFolder, reloaded.OutputFolder);
        Assert.Equal(config.SourceFoldersRoot, reloaded.SourceFoldersRoot);
        var memory = Assert.Single(reloaded.Memories);
        Assert.Equal("schotland-2010", memory.MemoryId);
        Assert.Equal(Day, memory.DefaultDate);
        Assert.Equal(["C:\\Photos\\Schotland 2010"], memory.SourceFolders);
    }

    [Fact]
    public void Adding_a_source_folder_that_exists_creates_a_memory_not_yet_indexed()
    {
        Directory.CreateDirectory(_root);
        var folder = Path.Combine(_root, "Schotland 2010");
        Directory.CreateDirectory(folder);
        var config = new IndexerConfig();

        config.AddSourceFolder(folder);

        Assert.Contains(folder, config.SourceFolders);
        var memory = Assert.Single(config.Memories);
        Assert.Equal("Schotland 2010", memory.Name);
        Assert.True(memory.NeedsReindex);
        Assert.Null(memory.IndexedAt);
        Assert.Null(config.FindIndexed(folder));
    }

    [Fact]
    public void Adding_a_source_folder_that_does_not_exist_throws_a_clear_error()
    {
        var config = new IndexerConfig();
        var missing = Path.Combine(_root, "Does Not Exist");

        var ex = Assert.Throws<DirectoryNotFoundException>(() => config.AddSourceFolder(missing));
        Assert.Contains(missing, ex.Message);
        Assert.Empty(config.Memories);
    }

    [Fact]
    public void Adding_the_same_source_folder_twice_is_a_no_op()
    {
        Directory.CreateDirectory(_root);
        var config = new IndexerConfig();

        config.AddSourceFolder(_root);
        config.AddSourceFolder(_root);

        Assert.Single(config.Memories);
    }

    [Fact]
    public void Removing_a_source_folder_drops_it_even_if_it_no_longer_exists_on_disk()
    {
        var config = new IndexerConfig();
        config.RecordIndexed("C:\\Gone", "gone", "Gone", "Ergens", Day);

        config.RemoveSourceFolder("C:\\Gone");

        Assert.Empty(config.Memories);
    }

    [Fact]
    public void Recording_an_indexed_folder_makes_it_findable()
    {
        var config = new IndexerConfig();

        config.RecordIndexed("C:\\Photos\\Schotland 2010", "schotland-2010", "Schotland 2010", "Schotland", Day);

        var indexed = config.FindIndexed("C:\\Photos\\Schotland 2010");
        Assert.NotNull(indexed);
        Assert.Equal("schotland-2010", indexed!.MemoryId);
        Assert.Equal("Schotland 2010", indexed.Name);
        Assert.Equal("Schotland", indexed.DestinationName);
        Assert.Equal(Day, indexed.DefaultDate);
        Assert.False(indexed.NeedsReindex);
        Assert.NotNull(indexed.IndexedAt);
    }

    [Fact]
    public void Indexing_a_folder_that_was_just_added_completes_its_memory_instead_of_adding_another()
    {
        Directory.CreateDirectory(_root);
        var config = new IndexerConfig();
        config.AddSourceFolder(_root);

        config.RecordIndexed(_root, "schotland-2010", "Schotland 2010", "Schotland", Day);

        var memory = Assert.Single(config.Memories);
        Assert.Equal("schotland-2010", memory.MemoryId);
        Assert.False(memory.NeedsReindex);
        Assert.NotNull(config.FindIndexed(_root));
    }

    [Fact]
    public void Renaming_an_indexed_folder_changes_only_its_memory_name()
    {
        var config = new IndexerConfig();
        config.RecordIndexed("C:\\Photos\\Noorwegen 2014", "noorwegen-2010", "Noorwegen 2010", "Oslo", Day);

        config.UpdateIndexedMemoryName("C:\\Photos\\Noorwegen 2014", "Noorwegen 2014");

        var indexed = Assert.Single(config.Memories);
        Assert.Equal("Noorwegen 2014", indexed.Name);
        Assert.Equal("noorwegen-2010", indexed.MemoryId);
        Assert.Equal("Oslo", indexed.DestinationName);
    }

    [Fact]
    public void Changing_the_destination_keeps_the_scan_time()
    {
        var config = new IndexerConfig();
        config.RecordIndexed("C:\\Photos\\X", "x-2010", "X 2010", "X", Day);
        var scanned = config.FindIndexed("C:\\Photos\\X")!.IndexedAt;

        config.UpdateIndexedDestinationName("C:\\Photos\\X", "Y");

        var indexed = config.FindIndexed("C:\\Photos\\X")!;
        Assert.Equal("Y", indexed.DestinationName);
        Assert.Equal(scanned, indexed.IndexedAt);
    }

    [Fact]
    public void Recording_an_indexed_folder_twice_replaces_the_previous_record()
    {
        var config = new IndexerConfig();
        config.RecordIndexed("C:\\Photos\\X", "x-2010", "X 2010", "X", Day);

        config.RecordIndexed("C:\\Photos\\X", "x-2011", "X 2011", "X", Day);

        var indexed = config.FindIndexed("C:\\Photos\\X");
        Assert.Equal("x-2011", indexed!.MemoryId);
        Assert.Single(config.Memories);
    }

    [Fact]
    public void An_unindexed_folder_is_not_found()
    {
        var config = new IndexerConfig();

        Assert.Null(config.FindIndexed("C:\\Photos\\Never Indexed"));
    }

    [Fact]
    public void Removing_a_source_folder_also_forgets_its_memory()
    {
        var config = new IndexerConfig();
        config.RecordIndexed("C:\\Photos\\X", "x-2010", "X 2010", "X", Day);

        config.RemoveSourceFolder("C:\\Photos\\X");

        Assert.Null(config.FindIndexed("C:\\Photos\\X"));
        Assert.Empty(config.SourceFolders);
    }

    [Fact]
    public void Saving_over_a_config_that_still_has_its_v1_folders_is_refused_so_they_are_not_lost()
    {
        var path = Path.Combine(_root, "config.json");
        Directory.CreateDirectory(_root);
        const string v1 = """{ "sourceFolders": [ "C:\\Photos\\X" ], "indexedFolders": [] }""";
        File.WriteAllText(path, v1);

        Assert.Throws<InvalidOperationException>(() => new IndexerConfig().Save(path));

        Assert.Equal(v1, File.ReadAllText(path));
    }

    [Fact]
    public void A_memory_without_a_destination_is_allowed()
    {
        var config = new IndexerConfig();

        config.RecordIndexed("C:\\Photos\\X", "x-2010", "X 2010", destinationName: null, Day);

        Assert.Null(config.FindIndexed("C:\\Photos\\X")!.DestinationName);
    }
}
