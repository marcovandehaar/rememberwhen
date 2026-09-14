using System.IO;
using System.Text.Json;
using Indexer.Catalog;
using Indexer.Config;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace Indexer.Web;

// The local web-UI docs/v1-build-spec.md's Configuratie section calls for
// (#22, #37): the Indexer starts this itself, serving both the settings
// screen this ticket builds and — sharing this same scaffold — the
// confirmation screen #34 adds later.
public static class UiServer
{
    public static void Run(string configPath, string url)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            WebRootPath = Path.Combine(AppContext.BaseDirectory, "Web", "wwwroot"),
        });
        builder.WebHost.UseUrls(url);
        builder.Logging.SetMinimumLevel(LogLevel.Warning);

        var app = builder.Build();
        var runs = new RunTracker();

        app.UseDefaultFiles();
        app.UseStaticFiles();

        app.MapGet("/api/config", () => Results.Json(BuildConfigView(configPath), JsonOptions.Default));

        app.MapPost("/api/config/source-folders", (SourceFolderRequest body) =>
        {
            var config = IndexerConfig.Load(configPath);
            try
            {
                config.AddSourceFolder(body.Path);
            }
            catch (DirectoryNotFoundException ex)
            {
                return Results.BadRequest(new ErrorResponse(ex.Message));
            }

            config.Save(configPath);
            return Results.Json(BuildConfigView(configPath), JsonOptions.Default);
        });

        app.MapDelete("/api/config/source-folders", (string path) =>
        {
            var config = IndexerConfig.Load(configPath);
            config.RemoveSourceFolder(path);
            config.Save(configPath);
            return Results.Json(BuildConfigView(configPath), JsonOptions.Default);
        });

        app.MapPut("/api/config/output-folder", (PathRequest body) =>
        {
            if (string.IsNullOrWhiteSpace(body.Path))
                return Results.BadRequest(new ErrorResponse("Output-locatie mag niet leeg zijn."));

            try
            {
                ResolveRelativeToConfig(configPath, body.Path);
            }
            catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
            {
                return Results.BadRequest(new ErrorResponse($"Ongeldig pad: {ex.Message}"));
            }

            var config = IndexerConfig.Load(configPath);
            config.OutputFolder = body.Path;
            config.Save(configPath);
            return Results.Json(BuildConfigView(configPath), JsonOptions.Default);
        });

        app.MapPut("/api/config/gazetteer-path", (PathRequest body) =>
        {
            if (string.IsNullOrWhiteSpace(body.Path))
                return Results.BadRequest(new ErrorResponse("Gazetteer-pad mag niet leeg zijn."));

            var config = IndexerConfig.Load(configPath);
            config.GazetteerPath = body.Path;
            config.Save(configPath);
            return Results.Json(BuildConfigView(configPath), JsonOptions.Default);
        });

        app.MapPost("/api/config/gazetteer-file", () =>
        {
            var config = IndexerConfig.Load(configPath);
            var resolved = ResolveRelativeToConfig(configPath, config.GazetteerPath);
            if (File.Exists(resolved))
                return Results.BadRequest(new ErrorResponse($"Gazetteer bestaat al op {resolved}."));

            Directory.CreateDirectory(Path.GetDirectoryName(resolved)!);
            Gazetteer.CreateEmpty().Save(resolved);
            return Results.Json(BuildConfigView(configPath), JsonOptions.Default);
        });

        app.MapGet("/api/gazetteer", () =>
        {
            var (gazetteer, _, error) = LoadGazetteer(configPath,
                resolved => Results.NotFound(new ErrorResponse($"Gazetteer niet gevonden op {resolved}.")));
            if (error is not null) return error;

            return Results.Json(new GazetteerView(gazetteer!.Entries), JsonOptions.Default);
        });

        app.MapPut("/api/gazetteer/entries", (GazetteerEntryRequest body) =>
        {
            if (string.IsNullOrWhiteSpace(body.Name))
                return Results.BadRequest(new ErrorResponse("Destination-naam mag niet leeg zijn."));
            if (body.Lat is < -90 or > 90)
                return Results.BadRequest(new ErrorResponse("Latitude moet tussen -90 en 90 liggen."));
            if (body.Lon is < -180 or > 180)
                return Results.BadRequest(new ErrorResponse("Longitude moet tussen -180 en 180 liggen."));

            var (gazetteer, resolved, error) = LoadGazetteer(configPath,
                r => Results.BadRequest(new ErrorResponse($"Gazetteer niet gevonden op {r}. Maak 'm eerst aan.")));
            if (error is not null) return error;

            gazetteer!.Upsert(body.Name, new Coordinate(body.Lat, body.Lon));
            gazetteer.Save(resolved);
            return Results.Json(new GazetteerView(gazetteer.Entries), JsonOptions.Default);
        });

        app.MapDelete("/api/gazetteer/entries/{name}", (string name) =>
        {
            var (gazetteer, resolved, error) = LoadGazetteer(configPath,
                r => Results.BadRequest(new ErrorResponse($"Gazetteer niet gevonden op {r}.")));
            if (error is not null) return error;

            gazetteer!.Remove(name);
            gazetteer.Save(resolved);
            return Results.Json(new GazetteerView(gazetteer.Entries), JsonOptions.Default);
        });

        app.MapPost("/api/runs", (StartRunRequest body) =>
        {
            var config = IndexerConfig.Load(configPath);

            if (string.IsNullOrWhiteSpace(body.SourceFolder) || !config.SourceFolders.Contains(body.SourceFolder))
                return Results.BadRequest(new ErrorResponse("Kies een geconfigureerde Source Folder."));
            if (!Directory.Exists(body.SourceFolder))
                return Results.BadRequest(new ErrorResponse($"Source Folder bestaat niet meer: {body.SourceFolder}"));
            if (string.IsNullOrWhiteSpace(body.MemoryName))
                return Results.BadRequest(new ErrorResponse("Memory-naam mag niet leeg zijn."));
            if (string.IsNullOrWhiteSpace(body.DestinationName))
                return Results.BadRequest(new ErrorResponse("Destination-naam mag niet leeg zijn."));

            var (_, gazetteerPath, error) = LoadGazetteer(configPath,
                r => Results.BadRequest(new ErrorResponse($"Gazetteer niet gevonden op {r}. Configureer 'm eerst.")));
            if (error is not null) return error;

            var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);

            var run = runs.Start(state =>
            {
                var log = new RunLogWriter(state);
                var gazetteer = Gazetteer.Load(gazetteerPath);
                var catalog = CatalogBuilder.Build(
                    body.SourceFolder, body.MemoryName, body.DestinationName, gazetteer, outputFolder, log);

                Directory.CreateDirectory(outputFolder);
                var catalogPath = Path.Combine(outputFolder, "catalog.json");
                File.WriteAllText(catalogPath, JsonSerializer.Serialize(catalog, JsonOptions.Default));
                state.AppendLog($"Catalogus geschreven: {catalogPath}");
                state.MarkSucceeded(catalogPath);
            });

            return Results.Json(new { runId = run.Id }, JsonOptions.Default);
        });

        app.MapGet("/api/runs/{id}", (string id) =>
        {
            var run = runs.Get(id);
            if (run is null) return Results.NotFound(new ErrorResponse("Onbekende run."));

            return Results.Json(
                new RunView(run.Status, run.SnapshotLog(), run.Error, run.CatalogPath),
                JsonOptions.Default);
        });

        app.Run();
    }

    private static ConfigView BuildConfigView(string configPath)
    {
        var config = IndexerConfig.Load(configPath);
        var gazetteerPath = ResolveRelativeToConfig(configPath, config.GazetteerPath);
        var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);

        return new ConfigView(
            config.SourceFolders.Select(f => new SourceFolderView(f, Directory.Exists(f))).ToList(),
            config.GazetteerPath,
            gazetteerPath,
            File.Exists(gazetteerPath),
            config.OutputFolder,
            outputFolder);
    }

    private static (Gazetteer? Gazetteer, string ResolvedPath, IResult? Error) LoadGazetteer(
        string configPath, Func<string, IResult> notFound)
    {
        var config = IndexerConfig.Load(configPath);
        var resolved = ResolveRelativeToConfig(configPath, config.GazetteerPath);
        return File.Exists(resolved)
            ? (Gazetteer.Load(resolved), resolved, null)
            : (null, resolved, notFound(resolved));
    }

    private static string ResolveRelativeToConfig(string configPath, string maybeRelative) =>
        Path.IsPathRooted(maybeRelative)
            ? maybeRelative
            : Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(configPath))!, maybeRelative));
}

public sealed record SourceFolderRequest(string Path);

public sealed record PathRequest(string Path);

public sealed record GazetteerEntryRequest(string Name, double Lat, double Lon);

public sealed record StartRunRequest(string SourceFolder, string MemoryName, string DestinationName);

public sealed record ErrorResponse(string Error);

public sealed record SourceFolderView(string Path, bool Exists);

public sealed record ConfigView(
    List<SourceFolderView> SourceFolders,
    string GazetteerPath,
    string GazetteerPathResolved,
    bool GazetteerExists,
    string OutputFolder,
    string OutputFolderResolved);

public sealed record GazetteerView(IReadOnlyDictionary<string, Coordinate> Entries);

public sealed record RunView(RunStatus Status, List<string> Log, string? Error, string? CatalogPath);
