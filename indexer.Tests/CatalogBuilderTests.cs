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
}
