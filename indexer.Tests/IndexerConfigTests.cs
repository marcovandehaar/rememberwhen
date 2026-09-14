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
        };

        config.Save(path);
        var reloaded = IndexerConfig.Load(path);

        Assert.Equal(config.SourceFolders, reloaded.SourceFolders);
        Assert.Equal(config.GazetteerPath, reloaded.GazetteerPath);
        Assert.Equal(config.OutputFolder, reloaded.OutputFolder);
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
}
