using System.Collections.Concurrent;
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

    // #44: UiServer.cs's handlers each wrap their whole Load-mutate-Save
    // sequence in `lock (CatalogStore.Gate)`. Without that (or without Load/
    // Save taking the same lock internally), threads racing this hard
    // reproduced a real Windows IOException ("used by another process") —
    // this proves the fix holds under genuine concurrent access, not just
    // sequential calls.
    [Fact]
    public void Concurrent_load_modify_save_transactions_dont_crash_or_lose_updates()
    {
        Directory.CreateDirectory(_root);
        var path = Path.Combine(_root, "catalog.json");
        CatalogStore.Save(new RwCatalog(), path);

        var exceptions = new ConcurrentBag<Exception>();
        var threads = Enumerable.Range(0, 20).Select(i => new Thread(() =>
        {
            try
            {
                lock (CatalogStore.Gate)
                {
                    var catalog = CatalogStore.Load(path);
                    CatalogStore.Save(CatalogStore.Replace(catalog, Memory($"m{i}")), path);
                }
            }
            catch (Exception ex)
            {
                exceptions.Add(ex);
            }
        })).ToList();

        foreach (var t in threads) t.Start();
        foreach (var t in threads) t.Join();

        Assert.Empty(exceptions);
        var final = CatalogStore.Load(path);
        Assert.Equal(20, final.Memories.Count);
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
        Directory.CreateDirectory(Path.Combine(_root, "a"));
        Directory.CreateDirectory(Path.Combine(_root, "b"));
        File.WriteAllText(Path.Combine(_root, "a", "a-c1-0000-x-story.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a", "a-c1-0000-x-thumb.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a", "a-c1-0001-y-story.jpg"), ""); // orphaned: y no longer exists
        File.WriteAllText(Path.Combine(_root, "b", "b-c1-0000-z-story.jpg"), ""); // a different memory entirely

        var memory = Memory("a", chapters: [
            new RwChapter
            {
                Id = "a-c1",
                MediaItems = [MediaItem("a-c1-0000-x", "media/a-c1-0000-x-story.jpg")],
            },
        ], coverImage: "media/a-c1-0000-x-thumb.jpg");

        CatalogStore.PruneStaleMediaFiles(_root, memory);

        var remaining = Directory.GetFiles(_root, "*", SearchOption.AllDirectories).Select(f => Path.GetRelativePath(_root, f).Replace('\\', '/')).ToHashSet();
        Assert.Equal(new HashSet<string> { "a/a-c1-0000-x-story.jpg", "a/a-c1-0000-x-thumb.jpg", "b/b-c1-0000-z-story.jpg" }, remaining);
    }

    [Fact]
    public void Setting_a_cover_repoints_both_the_pin_thumbnail_and_the_mid_size_cover()
    {
        var catalog = new RwCatalog { Memories = [TwoItemMemory()] };

        var updated = CatalogStore.SetCover(catalog, "a", "media/a-c1-0001-y-thumb.jpg", "media/a-c1-0001-y-cover.jpg");

        var memory = updated.Memories.Single();
        Assert.Equal("media/a-c1-0001-y-thumb.jpg", memory.CoverImage);
        Assert.Equal("media/a-c1-0001-y-cover.jpg", memory.CoverPhoto);
    }

    [Fact]
    public void Other_edits_keep_the_mid_size_cover()
    {
        var catalog = new RwCatalog { Memories = [TwoItemMemory(coverPhoto: "media/a-c1-0000-x-cover.jpg")] };

        Assert.Equal("media/a-c1-0000-x-cover.jpg", CatalogStore.SetName(catalog, "a", "Nieuw").Memories[0].CoverPhoto);
        Assert.Equal("media/a-c1-0000-x-cover.jpg", CatalogStore.SetDestination(catalog, "a", "Elders", new Coordinate(1, 2)).Memories[0].CoverPhoto);
        Assert.Equal("media/a-c1-0000-x-cover.jpg",
            CatalogStore.RemoveMediaItem(catalog, "a", "a-c1-0001-y").Catalog.Memories[0].CoverPhoto);
    }

    [Fact]
    public void PruneStaleMediaFiles_keeps_the_current_mid_size_cover_and_deletes_an_old_one()
    {
        Directory.CreateDirectory(Path.Combine(_root, "a"));
        File.WriteAllText(Path.Combine(_root, "a", "a-c1-0000-x-story.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a", "a-c1-0000-x-thumb.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a", "a-c1-0000-x-cover.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "a", "a-c1-0001-y-cover.jpg"), ""); // the cover before the operator changed it

        var memory = Memory("a", chapters: [
            new RwChapter { Id = "a-c1", MediaItems = [MediaItem("a-c1-0000-x", "media/a-c1-0000-x-story.jpg")] },
        ], coverImage: "media/a-c1-0000-x-thumb.jpg", coverPhoto: "media/a-c1-0000-x-cover.jpg");

        CatalogStore.PruneStaleMediaFiles(_root, memory);

        var remaining = Directory.GetFiles(Path.Combine(_root, "a")).Select(Path.GetFileName).ToHashSet();
        Assert.Equal(new HashSet<string?> { "a-c1-0000-x-story.jpg", "a-c1-0000-x-thumb.jpg", "a-c1-0000-x-cover.jpg" }, remaining);
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
    public void SetStoryRect_updates_only_the_matching_items_framing()
    {
        var catalog = new RwCatalog { Memories = [TwoItemMemory()] };
        var newRect = new StoryRect(0.1, 0.2, 0.5, 0.5);

        var result = CatalogStore.SetStoryRect(catalog, "a", "a-c1-0001-y", newRect);

        var chapter = Assert.Single(Assert.Single(result.Memories).Chapters);
        Assert.Equal(newRect, chapter.MediaItems.Single(i => i.Id == "a-c1-0001-y").StoryRect);
        Assert.NotEqual(newRect, chapter.MediaItems.Single(i => i.Id == "a-c1-0000-x").StoryRect);
    }

    [Fact]
    public void SetStoryRect_preserves_the_order_of_items_in_the_chapter()
    {
        var catalog = new RwCatalog { Memories = [TwoItemMemory()] };

        var result = CatalogStore.SetStoryRect(catalog, "a", "a-c1-0000-x", new StoryRect(0, 0, 1, 1));

        var chapter = Assert.Single(Assert.Single(result.Memories).Chapters);
        Assert.Equal(["a-c1-0000-x", "a-c1-0001-y"], chapter.MediaItems.Select(i => i.Id));
    }

    [Fact]
    public void ResolveMediaFile_serves_a_file_inside_a_memory_folder_and_refuses_traversal()
    {
        Directory.CreateDirectory(Path.Combine(_root, "a"));
        File.WriteAllText(Path.Combine(_root, "a", "x-story.jpg"), "");
        var secret = Path.Combine(Path.GetDirectoryName(_root)!, $"{Guid.NewGuid()}-secret.json");
        File.WriteAllText(secret, "");

        Assert.NotNull(CatalogStore.ResolveMediaFile(_root, "a/x-story.jpg"));
        Assert.Null(CatalogStore.ResolveMediaFile(_root, "a/missing.jpg"));
        Assert.Null(CatalogStore.ResolveMediaFile(_root, "../" + Path.GetFileName(secret)));
        Assert.Null(CatalogStore.ResolveMediaFile(_root, "a/../../" + Path.GetFileName(secret)));
        Assert.Null(CatalogStore.ResolveMediaFile(_root, secret));
        File.Delete(secret);
    }

    [Fact]
    public void DeleteMediaFilesForMemory_removes_the_memorys_whole_folder_and_nothing_else()
    {
        Directory.CreateDirectory(Path.Combine(_root, "a"));
        Directory.CreateDirectory(Path.Combine(_root, "b"));
        File.WriteAllText(Path.Combine(_root, "a", "a-c1-0000-x-story.jpg"), "");
        File.WriteAllText(Path.Combine(_root, "b", "b-c1-0000-z-story.jpg"), "");

        CatalogStore.DeleteMediaFilesForMemory(_root, Memory("a", chapters: [new RwChapter { Id = "a-c1" }]));

        Assert.False(Directory.Exists(Path.Combine(_root, "a")));
        Assert.Equal(["b-c1-0000-z-story.jpg"], Directory.GetFiles(Path.Combine(_root, "b")).Select(Path.GetFileName));
    }

    // A mistyped name (the year, say) is fixed without a rescan: only the
    // displayed name changes; the id and media filenames are internal.
    [Fact]
    public void Renaming_a_memory_changes_only_its_name_and_keeps_everything_else_in_place()
    {
        var catalog = new RwCatalog { Memories = [Memory("zzz"), TwoItemMemory(), Memory("yyy")] };

        var renamed = CatalogStore.SetName(catalog, "a", "Beta 2014");

        Assert.Equal(["zzz", "a", "yyy"], renamed.Memories.Select(m => m.Id));
        var memory = renamed.Memories[1];
        Assert.Equal("Beta 2014", memory.Name);
        Assert.Equal("Ergens", memory.Destination!.Name);
        Assert.Equal("media/a-c1-0000-x-thumb.jpg", memory.CoverImage);
        Assert.Equal(["a-c1-0000-x", "a-c1-0001-y"], memory.Chapters.Single().MediaItems.Select(i => i.Id));
    }

    private static RwMemory TwoItemMemory(string? coverPhoto = null) => Memory("a", chapters: [
        new RwChapter
        {
            Id = "a-c1",
            MediaItems =
            [
                MediaItem("a-c1-0000-x", "media/a-c1-0000-x-story.jpg"),
                MediaItem("a-c1-0001-y", "media/a-c1-0001-y-story.jpg"),
            ],
        },
    ], coverImage: "media/a-c1-0000-x-thumb.jpg", coverPhoto: coverPhoto);

    private static RwMediaItem MediaItem(string id, string mediaRef) => new()
    {
        Id = id,
        MediaRef = mediaRef,
        Type = MediaKind.Photo,
        StoryRect = new StoryRect(0, 0, 1, 1),
        ShotDuration = 4,
    };

    [Fact]
    public void Clearing_the_destination_makes_a_memory_not_a_trip_and_leaves_the_rest_alone()
    {
        var catalog = new RwCatalog { Memories = [Memory("a", coverPhoto: "media/a-cover.jpg"), Memory("b")] };

        var cleared = CatalogStore.ClearDestination(catalog, "a");

        Assert.Null(cleared.Memories.Single(m => m.Id == "a").Destination);
        Assert.Equal("media/a-cover.jpg", cleared.Memories.Single(m => m.Id == "a").CoverPhoto);
        Assert.NotNull(cleared.Memories.Single(m => m.Id == "b").Destination);
    }

    [Fact]
    public void Setting_the_date_changes_only_that_memorys_date()
    {
        var catalog = new RwCatalog { Memories = [Memory("a"), Memory("b")] };

        var updated = CatalogStore.SetDate(catalog, "a", new DateOnly(2023, 12, 24));

        Assert.Equal(new DateOnly(2023, 12, 24), updated.Memories.Single(m => m.Id == "a").Date);
        Assert.Equal(new DateOnly(2016, 7, 1), updated.Memories.Single(m => m.Id == "b").Date);
    }

    private static RwMemory Memory(string id, string? name = null, List<RwChapter>? chapters = null, string? coverImage = null, string? coverPhoto = null) => new()
    {
        Id = id,
        Name = name ?? id,
        Destination = new RwDestination("Ergens", new Coordinate(0, 0)),
        Date = new DateOnly(2016, 7, 1),
        CoverImage = coverImage ?? "media/cover.jpg",
        CoverPhoto = coverPhoto,
        Chapters = chapters ?? [],
    };
}
