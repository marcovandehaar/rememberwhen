using Indexer.Catalog;
using Indexer.Web;

namespace Indexer.Tests;

public class PendingPublishTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public void Load_of_a_missing_file_returns_an_empty_list()
    {
        var loaded = PendingPublish.Load(Path.Combine(_root, "pending-publish.json"));

        Assert.Empty(loaded);
    }

    [Fact]
    public void Save_and_load_round_trip()
    {
        Directory.CreateDirectory(_root);
        var path = Path.Combine(_root, "pending-publish.json");
        var instructions = PendingPublish.AddFile(PendingPublish.AddMemory([], "a"), "catalog.json");

        PendingPublish.Save(path, instructions);
        var reloaded = PendingPublish.Load(path);

        Assert.Equal(instructions, reloaded);
    }

    [Fact]
    public void AddMemory_does_not_duplicate_an_already_pending_memory()
    {
        var once = PendingPublish.AddMemory([], "a");
        var twice = PendingPublish.AddMemory(once, "a");

        Assert.Single(twice);
    }

    [Fact]
    public void AddFile_does_not_duplicate_an_already_pending_path()
    {
        var once = PendingPublish.AddFile([], "catalog.json");
        var twice = PendingPublish.AddFile(once, "catalog.json");

        Assert.Single(twice);
    }

    [Fact]
    public void AddMemory_and_AddFile_are_independent_and_both_kept()
    {
        var instructions = PendingPublish.AddFile(PendingPublish.AddMemory([], "a"), "catalog.json");

        Assert.Equal(2, instructions.Count);
    }

    [Fact]
    public void ResolveFiles_for_a_file_instruction_returns_exactly_that_path()
    {
        var instructions = PendingPublish.AddFile([], "media/a-c1-0000-x-thumb.jpg");

        var resolved = PendingPublish.ResolveFiles(instructions, new RwCatalog(), _root);

        Assert.Equal(["media/a-c1-0000-x-thumb.jpg"], resolved);
    }

    [Fact]
    public void ResolveFiles_for_a_memory_instruction_returns_every_current_file_matching_its_chapters()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "a-c1-0000-x-story.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a-c1-0000-x-thumb.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "b-c1-0000-z-story.jpg"), ""); // a different memory entirely

        var catalog = new RwCatalog { Memories = [Memory("a", [new RwChapter { Id = "a-c1" }])] };
        var instructions = PendingPublish.AddMemory([], "a");

        var resolved = PendingPublish.ResolveFiles(instructions, catalog, _root);

        Assert.Equal(["media/a-c1-0000-x-story.jpg", "media/a-c1-0000-x-thumb.jpg"], resolved);
    }

    // A folder removal logs a "memory" instruction for a Memory that's
    // already gone from the catalog by the time publish resolves it — see
    // UiServer.cs's /api/folders DELETE. Nothing left to publish for it, but
    // resolving must not throw.
    [Fact]
    public void ResolveFiles_for_a_memory_that_no_longer_exists_resolves_to_nothing()
    {
        var instructions = PendingPublish.AddMemory([], "removed-memory");

        var resolved = PendingPublish.ResolveFiles(instructions, new RwCatalog(), _root);

        Assert.Empty(resolved);
    }

    [Fact]
    public void ResolveFiles_dedupes_across_multiple_instructions()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "a-c1-0000-x-thumb.jpg"), "");

        var catalog = new RwCatalog { Memories = [Memory("a", [new RwChapter { Id = "a-c1" }])] };
        var instructions = PendingPublish.AddFile(PendingPublish.AddMemory([], "a"), "media/a-c1-0000-x-thumb.jpg");

        var resolved = PendingPublish.ResolveFiles(instructions, catalog, _root);

        Assert.Equal(["media/a-c1-0000-x-thumb.jpg"], resolved);
    }

    private static RwMemory Memory(string id, List<RwChapter> chapters) => new()
    {
        Id = id,
        Name = id,
        DestinationName = "Ergens",
        DestinationCoordinate = new Coordinate(0, 0),
        CoverImage = "media/cover.jpg",
        Chapters = chapters,
    };
}
