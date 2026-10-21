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
        var config = ConfigWithMemory("schotland-2010", "C:\\Photos\\Schotland 2010");
        config.GazetteerPath = "gazetteer.json";
        config.OutputFolder = "output";
        config.SourceFoldersRoot = "\\\\vandehaarnas\\Fotos";
        config.Memories[0].DestinationName = "Schotland";
        config.Memories[0].DateOverride = new DateOnly(2010, 8, 3);

        config.Save(path);
        var reloaded = IndexerConfig.Load(path);

        Assert.Equal(config.GazetteerPath, reloaded.GazetteerPath);
        Assert.Equal(config.OutputFolder, reloaded.OutputFolder);
        Assert.Equal(config.SourceFoldersRoot, reloaded.SourceFoldersRoot);
        var memory = Assert.Single(reloaded.Memories);
        Assert.Equal("schotland-2010", memory.MemoryId);
        Assert.Equal("Schotland", memory.DestinationName);
        Assert.Equal(Day, memory.DefaultDate);
        Assert.Equal(new DateOnly(2010, 8, 3), memory.DateOverride);
        Assert.Equal(["C:\\Photos\\Schotland 2010"], memory.SourceFolders);
    }

    private string Folder(string name)
    {
        var path = Path.Combine(_root, name);
        Directory.CreateDirectory(path);
        return path;
    }

    private IndexerConfig ConfigWithMemory(string memoryId, params string[] folders)
    {
        var config = new IndexerConfig();
        config.Memories.Add(new MemoryConfig
        {
            MemoryId = memoryId, Name = memoryId, DefaultDate = Day, IndexedAt = DateTimeOffset.UtcNow, SourceFolders = [.. folders],
        });
        return config;
    }

    [Fact]
    public void Adding_a_source_folder_to_a_memory_marks_it_for_reindexing_without_rebuilding_anything()
    {
        var a = Folder("a");
        var b = Folder("b");
        var config = ConfigWithMemory("zeeland", a);

        config.AddSourceFolderToMemory("zeeland", b);

        var memory = Assert.Single(config.Memories);
        Assert.Equal([a, b], memory.SourceFolders);
        Assert.True(memory.NeedsReindex);
    }

    [Fact]
    public void Adding_a_folder_the_memory_already_has_changes_nothing()
    {
        var a = Folder("a");
        var config = ConfigWithMemory("zeeland", a);

        config.AddSourceFolderToMemory("zeeland", a);

        var memory = Assert.Single(config.Memories);
        Assert.Equal([a], memory.SourceFolders);
        Assert.False(memory.NeedsReindex);
    }

    [Fact]
    public void Adding_a_folder_that_does_not_exist_is_refused()
    {
        var config = ConfigWithMemory("zeeland", Folder("a"));

        Assert.Throws<DirectoryNotFoundException>(() => config.AddSourceFolderToMemory("zeeland", Path.Combine(_root, "nope")));
    }

    [Fact]
    public void The_same_folder_may_feed_two_memories()
    {
        var shared = Folder("shared");
        var config = ConfigWithMemory("zeeland", shared);
        config.Memories.Add(new MemoryConfig { MemoryId = "zomer", Name = "Zomer", DefaultDate = Day, SourceFolders = [Folder("other")] });

        config.AddSourceFolderToMemory("zomer", shared);

        Assert.Equal(2, config.Memories.Count(m => m.SourceFolders.Contains(shared)));
    }

    [Fact]
    public void Removing_a_folder_from_a_memory_marks_it_for_reindexing()
    {
        var a = Folder("a");
        var b = Folder("b");
        var config = ConfigWithMemory("zeeland", a, b);

        config.RemoveSourceFolderFromMemory("zeeland", b);

        var memory = Assert.Single(config.Memories);
        Assert.Equal([a], memory.SourceFolders);
        Assert.True(memory.NeedsReindex);
    }

    [Fact]
    public void Removing_the_last_folder_of_a_memory_is_refused_with_a_message()
    {
        var a = Folder("a");
        var config = ConfigWithMemory("zeeland", a);

        var ex = Assert.Throws<InvalidOperationException>(() => config.RemoveSourceFolderFromMemory("zeeland", a));

        Assert.Contains("laatste", ex.Message);
        Assert.Equal([a], config.Memories[0].SourceFolders);
    }

    [Fact]
    public void Reindexing_a_memory_records_its_default_date_and_clears_needs_reindex_even_when_its_folder_is_shared()
    {
        var shared = Folder("shared");
        var config = ConfigWithMemory("zeeland", shared);
        config.Memories.Add(new MemoryConfig { MemoryId = "zomer", Name = "Zomer", DefaultDate = Day, NeedsReindex = true, SourceFolders = [shared] });

        config.RecordMemoryIndexed("zomer", "zomer-in-zeeland", "Zomer in Zeeland", null, new DateOnly(2016, 7, 1));

        var zomer = config.Memories.Single(m => m.Name == "Zomer in Zeeland");
        Assert.Equal("zomer-in-zeeland", zomer.MemoryId);
        Assert.Equal(new DateOnly(2016, 7, 1), zomer.DefaultDate);
        Assert.False(zomer.NeedsReindex);
        Assert.Null(zomer.DestinationName);
        Assert.Equal(Day, config.Memories.Single(m => m.MemoryId == "zeeland").DefaultDate);
    }

    [Fact]
    public void A_new_memory_has_a_name_and_a_first_folder_and_is_not_indexed_yet()
    {
        var folder = Folder("pip");
        var config = new IndexerConfig();

        var memory = config.AddMemory("Onze nieuwe hond", folder);

        Assert.Equal("onze-nieuwe-hond", memory.MemoryId);
        Assert.Equal([folder], memory.SourceFolders);
        Assert.Null(memory.IndexedAt);
        Assert.True(memory.NeedsReindex);
        Assert.Null(memory.DestinationName);
        Assert.Same(memory, Assert.Single(config.Memories));
    }

    [Fact]
    public void A_new_memory_needs_a_name_a_folder_that_exists_and_an_unused_id()
    {
        var folder = Folder("pip");
        var config = new IndexerConfig();
        config.AddMemory("Onze nieuwe hond", folder);

        Assert.Throws<ArgumentException>(() => config.AddMemory("  ", folder));
        Assert.Throws<DirectoryNotFoundException>(() => config.AddMemory("Anders", Path.Combine(_root, "nope")));
        var ex = Assert.Throws<InvalidOperationException>(() => config.AddMemory("Onze nieuwe hond", folder));
        Assert.Contains("al in gebruik", ex.Message);
    }

    [Fact]
    public void A_memorys_effective_date_is_the_override_or_else_the_default()
    {
        var config = ConfigWithMemory("kerst", Folder("a"));
        var memory = config.Memories[0];

        Assert.Equal(Day, memory.EffectiveDate);

        config.SetDateOverride("kerst", new DateOnly(2023, 12, 24));
        Assert.Equal(new DateOnly(2023, 12, 24), memory.EffectiveDate);
        Assert.Equal(Day, memory.DefaultDate);

        config.SetDateOverride("kerst", null);
        Assert.Equal(Day, memory.EffectiveDate);
    }

    [Fact]
    public void A_destination_can_be_set_and_cleared_on_a_memory()
    {
        var config = ConfigWithMemory("zeeland", Folder("a"));

        config.SetDestinationName("zeeland", "Zeeland");
        Assert.Equal("Zeeland", config.Memories[0].DestinationName);

        config.SetDestinationName("zeeland", null);
        Assert.Null(config.Memories[0].DestinationName);
    }

    [Fact]
    public void Renaming_a_memory_keeps_its_id_and_removing_one_leaves_the_others()
    {
        var config = ConfigWithMemory("zeeland", Folder("a"));
        config.Memories.Add(new MemoryConfig { MemoryId = "zomer", Name = "Zomer", DefaultDate = Day, SourceFolders = [Folder("b")] });

        config.RenameMemory("zeeland", "Zeeland 2016");
        config.RemoveMemory("zomer");

        var memory = Assert.Single(config.Memories);
        Assert.Equal("zeeland", memory.MemoryId);
        Assert.Equal("Zeeland 2016", memory.Name);
    }
}
