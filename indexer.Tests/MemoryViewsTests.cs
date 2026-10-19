using Indexer.Catalog;
using Indexer.Config;
using Indexer.Web;

namespace Indexer.Tests;

public class MemoryViewsTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 1, 12, 0, 0, TimeSpan.Zero);

    private static MemoryConfig Indexed(string id, DateOnly defaultDate, DateOnly? dateOverride = null, string? destination = null, params string[] folders) => new()
    {
        MemoryId = id, Name = id, DefaultDate = defaultDate, DateOverride = dateOverride, DestinationName = destination, IndexedAt = Now,
        SourceFolders = [.. folders.Length == 0 ? [$@"\nas\{id}"] : folders],
    };

    private static RwMemory InCatalog(string id, DateOnly date) => new()
    {
        Id = id, Name = id, Destination = null, Date = date, CoverImage = $"media/{id}-thumb.jpg", Chapters = [],
    };

    private static List<MemoryView> Build(IndexerConfig config, RwCatalog? catalog = null) =>
        MemoryViews.Build(config, catalog ?? new RwCatalog(), _ => true, path => $"/{path}");

    [Fact]
    public void A_trip_is_told_apart_from_a_memory_that_is_not_one_by_its_destination()
    {
        var config = new IndexerConfig { Memories = [Indexed("zeeland", new DateOnly(2016, 7, 1), destination: "Zeeland"), Indexed("hond", new DateOnly(2024, 6, 2))] };

        var views = Build(config);

        Assert.Equal("Zeeland", views.Single(v => v.MemoryId == "zeeland").DestinationName);
        Assert.Null(views.Single(v => v.MemoryId == "hond").DestinationName);
    }

    [Fact]
    public void The_date_shown_is_the_override_when_there_is_one_and_the_default_stays_visible()
    {
        var config = new IndexerConfig { Memories = [Indexed("kerst", new DateOnly(2024, 1, 2), new DateOnly(2023, 12, 24))] };

        var view = Build(config).Single();

        Assert.Equal(new DateOnly(2023, 12, 24), view.Date);
        Assert.Equal(new DateOnly(2023, 12, 24), view.DateOverride);
        Assert.Equal(new DateOnly(2024, 1, 2), view.DefaultDate);
    }

    [Fact]
    public void Memories_run_newest_first_by_their_effective_date()
    {
        var config = new IndexerConfig
        {
            Memories = [Indexed("oud", new DateOnly(2013, 2, 3)), Indexed("kerst", new DateOnly(2024, 1, 2), new DateOnly(2023, 12, 24)), Indexed("nieuw", new DateOnly(2025, 4, 18))],
        };

        Assert.Equal(["nieuw", "kerst", "oud"], Build(config).Select(v => v.MemoryId));
    }

    [Fact]
    public void A_memory_never_indexed_comes_first_and_has_no_date_yet()
    {
        var fresh = new MemoryConfig { MemoryId = "nieuw", Name = "Nieuw", DefaultDate = new DateOnly(2026, 10, 1), NeedsReindex = true, SourceFolders = [@"\nas\x"] };
        var config = new IndexerConfig { Memories = [Indexed("oud", new DateOnly(2013, 2, 3)), fresh] };

        var views = Build(config);

        Assert.Equal("nieuw", views[0].MemoryId);
        Assert.True(views[0].NeverIndexed);
        Assert.Null(views[0].Date);
        Assert.Null(views[0].CoverUrl);
    }

    [Fact]
    public void A_folder_shared_with_other_memories_says_how_many()
    {
        var shared = @"\nas\zomer";
        var config = new IndexerConfig
        {
            Memories = [Indexed("a", new DateOnly(2024, 7, 1), folders: [shared, @"\nas\a"]), Indexed("b", new DateOnly(2024, 7, 2), folders: [shared])],
        };

        var folders = Build(config).Single(v => v.MemoryId == "a").Folders;

        Assert.Equal(1, folders.Single(f => f.Path == shared).AlsoIn);
        Assert.Equal(0, folders.Single(f => f.Path == @"\nas\a").AlsoIn);
    }

    [Fact]
    public void The_needs_reindex_flag_and_missing_folders_come_through()
    {
        var memory = Indexed("a", new DateOnly(2024, 7, 1));
        memory.NeedsReindex = true;
        var config = new IndexerConfig { Memories = [memory] };

        var view = MemoryViews.Build(config, new RwCatalog(), _ => false, p => p).Single();

        Assert.True(view.NeedsReindex);
        Assert.False(view.Folders.Single().Exists);
    }

    [Fact]
    public void An_indexed_memory_carries_its_cover_and_the_destination_coordinate_from_the_catalogue()
    {
        var trip = new RwMemory
        {
            Id = "zeeland", Name = "zeeland", Destination = new RwDestination("Zeeland", new Coordinate(51.5, 3.8)), Date = new DateOnly(2016, 7, 1),
            CoverImage = "media/zeeland-thumb.jpg", Chapters = [],
        };
        var config = new IndexerConfig { Memories = [Indexed("zeeland", new DateOnly(2016, 7, 1), destination: "Zeeland")] };

        var view = Build(config, new RwCatalog { Memories = [trip] }).Single();

        Assert.Equal(new Coordinate(51.5, 3.8), view.DestinationCoordinate);
        Assert.StartsWith("/media/zeeland-thumb.jpg", view.CoverUrl);
    }
}
