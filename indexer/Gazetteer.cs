using System.IO;
using System.Text.Json;

namespace Indexer;

// docs/adr/0005-a-destinations-coordinate-comes-from-its-name.md — a
// Destination's coordinate always comes from its name, never from geocoding
// or a Media Item's own GPS. One growing JSON file, name -> coordinate,
// seeded by hand at the granularity of places actually visited.
public sealed class Gazetteer
{
    private readonly Dictionary<string, Coordinate> _entries;

    private Gazetteer(Dictionary<string, Coordinate> entries) => _entries = entries;

    public IReadOnlyDictionary<string, Coordinate> Entries => _entries;

    public static Gazetteer CreateEmpty() => new([]);

    public static Gazetteer Load(string path)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException(
                $"Gazetteer niet gevonden op {path}. Zaai 'm eerst handmatig met de bestemmingen die je gaat indexeren.", path);
        }

        var json = File.ReadAllText(path);
        var raw = JsonSerializer.Deserialize<Dictionary<string, Coordinate>>(json, JsonOptions.Default)
                  ?? throw new InvalidDataException($"Gazetteer op {path} kon niet gelezen worden.");
        return new Gazetteer(raw);
    }

    public Coordinate Lookup(string destinationName)
    {
        if (_entries.TryGetValue(destinationName, out var coordinate)) return coordinate;

        throw new KeyNotFoundException(
            $"'{destinationName}' staat niet in de Gazetteer. Voeg 'm handmatig toe voordat je opnieuw indexeert.");
    }

    public void Upsert(string destinationName, Coordinate coordinate) => _entries[destinationName] = coordinate;

    public bool Remove(string destinationName) => _entries.Remove(destinationName);

    public void Save(string path) =>
        File.WriteAllText(path, JsonSerializer.Serialize(_entries, JsonOptions.Default));
}
