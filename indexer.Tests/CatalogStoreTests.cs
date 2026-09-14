using Indexer.Catalog;

namespace Indexer.Tests;

public class CatalogStoreTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }

    [Fact]
    public void Loading_a_missing_catalog_returns_an_empty_one()
    {
        var catalog = CatalogStore.Load(Path.Combine(_root, "catalog.json"));

        Assert.Empty(catalog.Memories);
    }

    [Fact]
    public void Save_and_load_round_trip()
    {
        Directory.CreateDirectory(_root);
        var path = Path.Combine(_root, "catalog.json");
        var catalog = new RwCatalog { Memories = [Memory("a")] };

        CatalogStore.Save(catalog, path);
        var reloaded = CatalogStore.Load(path);

        Assert.Single(reloaded.Memories);
        Assert.Equal("a", reloaded.Memories[0].Id);
    }

    [Fact]
    public void Replace_appends_a_memory_that_was_not_there_before()
    {
        var catalog = new RwCatalog { Memories = [Memory("a")] };

        var result = CatalogStore.Replace(catalog, Memory("b"));

        Assert.Equal(["a", "b"], result.Memories.Select(m => m.Id));
    }

    [Fact]
    public void Replace_overwrites_the_memory_with_the_same_id_and_keeps_the_others()
    {
        var catalog = new RwCatalog { Memories = [Memory("a"), Memory("b")] };
        var updatedB = Memory("b", name: "B opnieuw geïndexeerd");

        var result = CatalogStore.Replace(catalog, updatedB);

        Assert.Equal(["a", "b"], result.Memories.Select(m => m.Id));
        Assert.Equal("B opnieuw geïndexeerd", result.Memories.Single(m => m.Id == "b").Name);
    }

    [Fact]
    public void RemoveMemory_drops_only_the_matching_memory()
    {
        var catalog = new RwCatalog { Memories = [Memory("a"), Memory("b")] };

        var result = CatalogStore.RemoveMemory(catalog, "a");

        Assert.Equal(["b"], result.Memories.Select(m => m.Id));
    }

    [Fact]
    public void RemoveMemory_is_a_no_op_when_the_id_is_not_present()
    {
        var catalog = new RwCatalog { Memories = [Memory("a")] };

        var result = CatalogStore.RemoveMemory(catalog, "does-not-exist");

        Assert.Single(result.Memories);
    }

    [Fact]
    public void DeleteMediaFiles_deletes_only_files_matching_the_prefix()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "a-2010-c1-0000-x-story.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a-2010-c1-0000-x-thumb.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "b-2011-c1-0000-y-story.jpg"), "");

        CatalogStore.DeleteMediaFiles(_root, "a-2010-c1-");

        Assert.Single(Directory.GetFiles(_root));
    }

    [Fact]
    public void DeleteMediaFiles_is_a_no_op_when_the_directory_does_not_exist()
    {
        CatalogStore.DeleteMediaFiles(Path.Combine(_root, "nope"), "x-");
    }

    [Fact]
    public void PruneStaleMediaFiles_deletes_only_files_the_rebuilt_memory_no_longer_references()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "a-c1-0000-x-story.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a-c1-0000-x-thumb.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a-c1-0001-y-story.jpg"), ""); // orphaned: y no longer exists
        File.WriteAllText(Path.Combine(_root, "b-c1-0000-z-story.jpg"), ""); // a different memory entirely

        var memory = Memory("a", chapters: [
            new RwChapter
            {
                Id = "a-c1",
                MediaItems = [MediaItem("a-c1-0000-x", "media/a-c1-0000-x-story.jpg")],
            },
        ], coverImage: "media/a-c1-0000-x-thumb.jpg");

        CatalogStore.PruneStaleMediaFiles(_root, memory);

        var remaining = Directory.GetFiles(_root).Select(Path.GetFileName).ToHashSet();
        Assert.Equal(new HashSet<string?> { "a-c1-0000-x-story.jpg", "a-c1-0000-x-thumb.jpg", "b-c1-0000-z-story.jpg" }, remaining);
    }

    [Fact]
    public void PruneStaleMediaFiles_is_a_no_op_when_the_directory_does_not_exist()
    {
        CatalogStore.PruneStaleMediaFiles(Path.Combine(_root, "nope"), Memory("a"));
    }

    [Fact]
    public void IsCover_matches_the_item_the_cover_image_was_generated_from()
    {
        var memory = Memory("a", coverImage: "media/a-c1-0000-x-thumb.jpg");

        Assert.True(CatalogStore.IsCover(memory, "a-c1-0000-x"));
        Assert.False(CatalogStore.IsCover(memory, "a-c1-0001-y"));
    }

    [Fact]
    public void RemoveMediaItem_drops_the_item_from_its_chapter()
    {
        var catalog = new RwCatalog { Memories = [TwoItemMemory()] };

        var result = CatalogStore.RemoveMediaItem(catalog, "a", "a-c1-0001-y");

        Assert.Null(result.Error);
        var chapter = Assert.Single(Assert.Single(result.Catalog.Memories).Chapters);
        Assert.Equal(["a-c1-0000-x"], chapter.MediaItems.Select(i => i.Id));
    }

    [Fact]
    public void RemoveMediaItem_refuses_to_remove_the_cover()
    {
        var catalog = new RwCatalog { Memories = [TwoItemMemory()] };

        var result = CatalogStore.RemoveMediaItem(catalog, "a", "a-c1-0000-x");

        Assert.NotNull(result.Error);
        Assert.Equal(2, Assert.Single(result.Catalog.Memories).Chapters[0].MediaItems.Count);
    }

    [Fact]
    public void RemoveMediaItem_refuses_to_empty_the_last_item_in_a_chapter()
    {
        var single = Memory("a", chapters: [
            new RwChapter { Id = "a-c1", MediaItems = [MediaItem("a-c1-0000-x", "media/a-c1-0000-x-story.jpg")] },
        ], coverImage: "media/other-thumb.jpg"); // not the cover, so the count guard is what's under test

        var result = CatalogStore.RemoveMediaItem(new RwCatalog { Memories = [single] }, "a", "a-c1-0000-x");

        Assert.NotNull(result.Error);
    }

    [Fact]
    public void RemoveMediaItem_reports_not_found_for_an_unknown_memory_or_item()
    {
        var catalog = new RwCatalog { Memories = [TwoItemMemory()] };

        var unknownMemory = CatalogStore.RemoveMediaItem(catalog, "does-not-exist", "a-c1-0001-y");
        var unknownItem = CatalogStore.RemoveMediaItem(catalog, "a", "does-not-exist");

        Assert.True(unknownMemory.NotFound);
        Assert.True(unknownItem.NotFound);
    }

    [Fact]
    public void DeleteMediaFilesForMemory_derives_the_prefix_from_the_memorys_own_chapters()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "a-c1-0000-x-story.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "b-c1-0000-z-story.jpg"), "");

        CatalogStore.DeleteMediaFilesForMemory(_root, Memory("a", chapters: [new RwChapter { Id = "a-c1" }]));

        Assert.Equal(["b-c1-0000-z-story.jpg"], Directory.GetFiles(_root).Select(Path.GetFileName));
    }

    private static RwMemory TwoItemMemory() => Memory("a", chapters: [
        new RwChapter
        {
            Id = "a-c1",
            MediaItems =
            [
                MediaItem("a-c1-0000-x", "media/a-c1-0000-x-story.jpg"),
                MediaItem("a-c1-0001-y", "media/a-c1-0001-y-story.jpg"),
            ],
        },
    ], coverImage: "media/a-c1-0000-x-thumb.jpg");

    private static RwMediaItem MediaItem(string id, string mediaRef) => new()
    {
        Id = id,
        MediaRef = mediaRef,
        Type = MediaKind.Photo,
        StoryRect = new StoryRect(0, 0, 1, 1),
        ShotDuration = 4,
    };

    private static RwMemory Memory(string id, string? name = null, List<RwChapter>? chapters = null, string? coverImage = null) => new()
    {
        Id = id,
        Name = name ?? id,
        DestinationName = "Ergens",
        DestinationCoordinate = new Coordinate(0, 0),
        CoverImage = coverImage ?? "media/cover.jpg",
        Chapters = chapters ?? [],
    };
}
