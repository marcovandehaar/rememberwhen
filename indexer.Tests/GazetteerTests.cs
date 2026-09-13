using Indexer;
using Indexer.Catalog;

namespace Indexer.Tests;

public class GazetteerTests
{
    [Fact]
    public void Looks_up_a_seeded_destination()
    {
        var path = WriteGazetteer("""{ "Zeeland": { "lat": 51.5, "lon": 3.8 } }""");

        try
        {
            var gazetteer = Gazetteer.Load(path);

            Assert.Equal(new Coordinate(51.5, 3.8), gazetteer.Lookup("Zeeland"));
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void Throws_a_clear_error_for_an_unseeded_destination()
    {
        var path = WriteGazetteer("{}");

        try
        {
            var gazetteer = Gazetteer.Load(path);

            var ex = Assert.Throws<KeyNotFoundException>(() => gazetteer.Lookup("Onbekend"));
            Assert.Contains("Onbekend", ex.Message);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void Throws_a_clear_error_when_the_file_itself_is_missing()
    {
        Assert.Throws<FileNotFoundException>(() => Gazetteer.Load(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString())));
    }

    private static string WriteGazetteer(string json)
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.json");
        File.WriteAllText(path, json);
        return path;
    }
}
