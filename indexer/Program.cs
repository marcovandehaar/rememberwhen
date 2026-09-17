using System.Diagnostics;
using System.IO;
using System.Text.Json;
using Indexer;
using Indexer.Catalog;
using Indexer.Web;

if (args.Length == 0)
{
    var configPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "config.json");
    const string url = "http://localhost:5183";

    Console.WriteLine($"Instellingen-UI gestart op {url} (Ctrl+C om te stoppen).");
    TryOpenBrowser(url);

    UiServer.Run(configPath, url);
    return 0;
}

if (args.Length < 4)
{
    Console.Error.WriteLine(
        "Gebruik: Indexer <source-folder> <memory-naam> <destination-naam> <output-folder> [gazetteer.json] [curation-folder]");
    Console.Error.WriteLine("Of: Indexer (zonder argumenten) start de instellingen-UI.");
    return 1;
}

var sourceFolder = args[0];
var memoryName = args[1];
var destinationName = args[2];
var outputFolder = args[3];
var gazetteerPath = args.Length > 4 ? args[4] : Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "gazetteer.json");
var curationFolder = args.Length > 5 ? args[5] : Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "curation-logs");

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    // Let CatalogBuilder unwind and clean up what it already wrote (see
    // there) instead of the process dying mid-write on the default Ctrl+C
    // behaviour.
    e.Cancel = true;
    Console.Error.WriteLine("Geannuleerd, opruimen…");
    cts.Cancel();
};

try
{
    var gazetteer = Gazetteer.Load(gazetteerPath);
    var catalog = CatalogBuilder.Build(sourceFolder, memoryName, destinationName, gazetteer, outputFolder, curationFolder,
        cancellationToken: cts.Token);

    Directory.CreateDirectory(outputFolder);
    var catalogPath = Path.Combine(outputFolder, "catalog.json");
    File.WriteAllText(catalogPath, JsonSerializer.Serialize(catalog, JsonOptions.Default));

    var memory = catalog.Memories[0];
    var mediaItemCount = memory.Chapters.Sum(chapter => chapter.MediaItems.Count);
    Console.WriteLine($"Catalogus geschreven: {catalogPath}");
    Console.WriteLine($"{mediaItemCount} Media Items in {memory.Chapters.Count} Chapters in '{memoryName}'.");
    return 0;
}
catch (OperationCanceledException)
{
    Console.Error.WriteLine("Indexeren geannuleerd; niets gepubliceerd.");
    return 130; // Conventional shell exit code for SIGINT.
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Indexeren mislukt: {ex.Message}");
    return 1;
}

static void TryOpenBrowser(string url)
{
    try
    {
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Kon geen browser openen ({ex.Message}); open {url} handmatig.");
    }
}
