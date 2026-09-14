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

    [Fact]
    public void Lists_all_seeded_entries()
    {
        var path = WriteGazetteer("""{ "Zeeland": { "lat": 51.5, "lon": 3.8 } }""");

        try
        {
            var gazetteer = Gazetteer.Load(path);

            Assert.Equal(new Coordinate(51.5, 3.8), gazetteer.Entries["Zeeland"]);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void Creates_an_empty_gazetteer_when_none_exists_yet()
    {
        var gazetteer = Gazetteer.CreateEmpty();

        Assert.Empty(gazetteer.Entries);
    }

    [Fact]
    public void Upsert_adds_a_new_destination_and_overwrites_an_existing_one()
    {
        var gazetteer = Gazetteer.CreateEmpty();

        gazetteer.Upsert("Zeeland", new Coordinate(51.5, 3.8));
        Assert.Equal(new Coordinate(51.5, 3.8), gazetteer.Lookup("Zeeland"));

        gazetteer.Upsert("Zeeland", new Coordinate(51.4, 3.6));
        Assert.Equal(new Coordinate(51.4, 3.6), gazetteer.Lookup("Zeeland"));
    }

    [Fact]
    public void Remove_drops_a_destination()
    {
        var gazetteer = Gazetteer.CreateEmpty();
        gazetteer.Upsert("Zeeland", new Coordinate(51.5, 3.8));

        var removed = gazetteer.Remove("Zeeland");

        Assert.True(removed);
        Assert.Empty(gazetteer.Entries);
    }

    [Fact]
    public void Save_round_trips_through_load()
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.json");
        var gazetteer = Gazetteer.CreateEmpty();
        gazetteer.Upsert("Zeeland", new Coordinate(51.5, 3.8));

        try
        {
            gazetteer.Save(path);
            var reloaded = Gazetteer.Load(path);

            Assert.Equal(new Coordinate(51.5, 3.8), reloaded.Lookup("Zeeland"));
        }
        finally
        {
            File.Delete(path);
        }
    }

    private static string WriteGazetteer(string json)
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.json");
        File.WriteAllText(path, json);
        return path;
    }
}
