using Indexer;
using Indexer.Catalog;

namespace Indexer.Tests;

public class CatalogBuilderTests : IDisposable
{
    private readonly string _sourceDir;
    private readonly string _outputDir;
    private readonly string _gazetteerPath;

    public CatalogBuilderTests()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _sourceDir = Path.Combine(root, "source");
        _outputDir = Path.Combine(root, "output");
        Directory.CreateDirectory(_sourceDir);

        _gazetteerPath = Path.Combine(root, "gazetteer.json");
        File.WriteAllText(_gazetteerPath, """{ "Zeeland": { "lat": 51.5, "lon": 3.8 } }""");
    }

    public void Dispose() => Directory.Delete(Path.GetDirectoryName(_sourceDir)!, recursive: true);

    [Fact]
    public void Builds_a_single_memory_with_one_hardcoded_chapter()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 4000, 3000, new DateTime(2016, 7, 2, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 4000, 3000, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, TextWriter.Null);

        var memory = Assert.Single(catalog.Memories);
        Assert.Equal("zeeland-2016", memory.Id);
        Assert.Equal("Zeeland 2016", memory.Name);
        Assert.Equal("Zeeland", memory.DestinationName);
        Assert.Equal(new Coordinate(51.5, 3.8), memory.DestinationCoordinate);

        var chapter = Assert.Single(memory.Chapters);
        Assert.Equal(2, chapter.MediaItems.Count);
    }

    [Fact]
    public void Orders_media_items_chronologically_regardless_of_filename()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, TextWriter.Null);

        var items = catalog.Memories[0].Chapters[0].MediaItems;
        Assert.True(items[0].CapturedAt < items[1].CapturedAt);
        Assert.EndsWith("-a", items[0].Id);
    }

    [Fact]
    public void Cover_image_is_the_earliest_item_and_the_file_exists()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "later.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "earliest.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, TextWriter.Null);

        var memory = catalog.Memories[0];
        Assert.Contains("earliest", memory.CoverImage);
        Assert.True(File.Exists(Path.Combine(_outputDir, memory.CoverImage)));
    }

    [Fact]
    public void Story_derivatives_exist_on_disk_and_are_referenced_by_a_relative_path()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 4000, 3000, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, TextWriter.Null);

        var item = catalog.Memories[0].Chapters[0].MediaItems[0];
        Assert.Equal(MediaKind.Photo, item.Type);
        Assert.True(File.Exists(Path.Combine(_outputDir, item.MediaRef)));
    }

    [Fact]
    public void Refuses_to_build_when_the_destination_is_not_seeded_in_the_gazetteer()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);

        Assert.Throws<KeyNotFoundException>(() =>
            CatalogBuilder.Build(_sourceDir, "Onbekend 2030", "Onbekend", gazetteer, _outputDir, TextWriter.Null));
    }

    [Fact]
    public void Chains_a_multi_day_trip_without_gps_into_one_chapter()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day1.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        // day 2 is skipped entirely, but that's only one empty day — not
        // enough on its own to split (#20/#31).
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day3.jpg"), 800, 600, new DateTime(2016, 7, 3, 9, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, TextWriter.Null);

        var chapter = Assert.Single(catalog.Memories[0].Chapters);
        Assert.Equal(2, chapter.MediaItems.Count);
        Assert.Null(chapter.Location);
    }

    [Fact]
    public void Splits_a_chapter_after_two_consecutive_empty_days_without_gps()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day1.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        // Days 2 and 3 are both empty — two consecutive empty days.
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day4.jpg"), 800, 600, new DateTime(2016, 7, 4, 9, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, TextWriter.Null);

        var chapters = catalog.Memories[0].Chapters;
        Assert.Equal(2, chapters.Count);
        Assert.Single(chapters[0].MediaItems);
        Assert.Single(chapters[1].MediaItems);
    }

    [Fact]
    public void Splits_within_a_single_day_on_a_large_gps_jump()
    {
        var morning = new Coordinate(0, 0);
        var afternoon = new Coordinate(0.1, 0); // ~11 km away — over the 5 km threshold
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "morning.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0), morning);
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "afternoon.jpg"), 800, 600, new DateTime(2016, 7, 1, 15, 0, 0), afternoon);

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, TextWriter.Null);

        var chapters = catalog.Memories[0].Chapters;
        Assert.Equal(2, chapters.Count);
        Assert.Equal(morning, chapters[0].Location);
        Assert.Equal(afternoon, chapters[1].Location);
    }

    [Fact]
    public void Suppresses_a_day_gap_boundary_when_gps_shows_the_same_place()
    {
        var place = new Coordinate(0, 0);
        var nearbyPlace = new Coordinate(0.02, 0); // ~2 km away — within the 5 km threshold
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day1.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0), place);
        // Two empty days would normally split this, but GPS shows it's the
        // same place before and after (#20's suppression rule).
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day4.jpg"), 800, 600, new DateTime(2016, 7, 4, 9, 0, 0), nearbyPlace);

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, TextWriter.Null);

        var chapter = Assert.Single(catalog.Memories[0].Chapters);
        Assert.Equal(2, chapter.MediaItems.Count);
        Assert.Equal(place, chapter.Location);
    }

    [Fact]
    public void Checks_the_gazetteer_before_reading_the_source_folder()
    {
        // A Source Folder that doesn't exist would make SourceFolderReader.Read
        // throw DirectoryNotFoundException — so seeing the Gazetteer's
        // KeyNotFoundException instead proves the lookup ran first (#38).
        var missingSourceDir = Path.Combine(Path.GetDirectoryName(_sourceDir)!, "does-not-exist");
        var gazetteer = Gazetteer.Load(_gazetteerPath);

        Assert.Throws<KeyNotFoundException>(() =>
            CatalogBuilder.Build(missingSourceDir, "Onbekend 2030", "Onbekend", gazetteer, _outputDir, TextWriter.Null));
    }
}
