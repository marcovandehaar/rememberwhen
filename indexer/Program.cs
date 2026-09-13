using System.IO;
using System.Text.Json;
using Indexer;
using Indexer.Catalog;

if (args.Length < 4)
{
    Console.Error.WriteLine(
        "Gebruik: Indexer <source-folder> <memory-naam> <destination-naam> <output-folder> [gazetteer.json]");
    return 1;
}

var sourceFolder = args[0];
var memoryName = args[1];
var destinationName = args[2];
var outputFolder = args[3];
var gazetteerPath = args.Length > 4 ? args[4] : Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "gazetteer.json");

try
{
    var gazetteer = Gazetteer.Load(gazetteerPath);
    var catalog = CatalogBuilder.Build(sourceFolder, memoryName, destinationName, gazetteer, outputFolder);

    Directory.CreateDirectory(outputFolder);
    var catalogPath = Path.Combine(outputFolder, "catalog.json");
    File.WriteAllText(catalogPath, JsonSerializer.Serialize(catalog, JsonOptions.Default));

    Console.WriteLine($"Catalogus geschreven: {catalogPath}");
    Console.WriteLine($"{catalog.Memories[0].Chapters[0].MediaItems.Count} Media Items in '{memoryName}'.");
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Indexeren mislukt: {ex.Message}");
    return 1;
}
