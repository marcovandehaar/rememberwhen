using System.IO;
using Indexer.Catalog;
using Indexer.Config;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Logging;

namespace Indexer.Web;

// The local web-UI docs/v1-build-spec.md's Configuratie section calls for
// (#22, #37): the Indexer starts this itself, serving both the settings
// screen this ticket builds and — sharing this same scaffold — the
// confirmation screen #34 adds later. The primary surface is folder-centric
// (add & index, reindex, remove) rather than a form-per-setting screen;
// the Gazetteer and output location live behind a secondary settings sheet.
public static class UiServer
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

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
        // Force revalidation rather than letting the browser assume the
        // page's own JS/CSS are still fresh after a rebuild — this tool gets
        // restarted mid-session more often than a normal website does.
        app.UseStaticFiles(new StaticFileOptions
        {
            OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache",
        });

        // Media derivatives live under the (configurable, arbitrary) output
        // folder, not under wwwroot, so they need their own route.
        app.MapGet("/media/{fileName}", (string fileName) =>
        {
            var config = IndexerConfig.Load(configPath);
            var mediaDir = Path.Combine(ResolveRelativeToConfig(configPath, config.OutputFolder), "media");
            var fullPath = Path.Combine(mediaDir, Path.GetFileName(fileName));
            if (!File.Exists(fullPath)) return Results.NotFound();

            ContentTypes.TryGetContentType(fullPath, out var contentType);
            return Results.File(fullPath, contentType ?? "application/octet-stream");
        });

        app.MapGet("/api/browse", (string? path) =>
        {
            var config = IndexerConfig.Load(configPath);
            var root = string.IsNullOrWhiteSpace(config.SourceFoldersRoot)
                ? null
                : ResolveRelativeToConfig(configPath, config.SourceFoldersRoot);

            try
            {
                return Results.Json(FileSystemBrowser.Browse(path, root), JsonOptions.Default);
            }
            catch (Exception ex) when (ex is DirectoryNotFoundException or UnauthorizedAccessException or IOException)
            {
                return Results.BadRequest(new ErrorResponse(ex.Message));
            }
        });

        app.MapGet("/api/folders", () => Results.Json(BuildFolderViews(configPath), JsonOptions.Default));

        app.MapPost("/api/folders", (PathRequest body) =>
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
            return Results.Json(BuildFolderViews(configPath), JsonOptions.Default);
        });

        app.MapDelete("/api/folders", (string path) =>
        {
            var config = IndexerConfig.Load(configPath);
            var indexed = config.FindIndexed(path);
            if (indexed is not null)
            {
                var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);
                var catalogPath = Path.Combine(outputFolder, "catalog.json");
                var catalog = CatalogStore.Load(catalogPath);
                var memory = catalog.Memories.FirstOrDefault(m => m.Id == indexed.MemoryId);

                CatalogStore.Save(CatalogStore.RemoveMemory(catalog, indexed.MemoryId), catalogPath);
                if (memory is not null)
                    CatalogStore.DeleteMediaFilesForMemory(Path.Combine(outputFolder, "media"), memory);
            }

            config.RemoveSourceFolder(path);
            config.Save(configPath);
            return Results.Json(BuildFolderViews(configPath), JsonOptions.Default);
        });

        app.MapPost("/api/folders/index", (IndexFolderRequest body) =>
        {
            var config = IndexerConfig.Load(configPath);

            if (string.IsNullOrWhiteSpace(body.Path) || !config.SourceFolders.Contains(body.Path))
                return Results.BadRequest(new ErrorResponse("Kies een geconfigureerde Source Folder."));
            if (!Directory.Exists(body.Path))
                return Results.BadRequest(new ErrorResponse($"Source Folder bestaat niet meer: {body.Path}"));

            var existing = config.FindIndexed(body.Path);
            var memoryName = string.IsNullOrWhiteSpace(body.MemoryName) ? existing?.MemoryName : body.MemoryName;
            var destinationName = string.IsNullOrWhiteSpace(body.DestinationName) ? existing?.DestinationName : body.DestinationName;

            if (string.IsNullOrWhiteSpace(memoryName))
                return Results.BadRequest(new ErrorResponse("Memory-naam mag niet leeg zijn."));
            if (string.IsNullOrWhiteSpace(destinationName))
                return Results.BadRequest(new ErrorResponse("Destination-naam mag niet leeg zijn."));

            var newMemoryId = Slug.From(memoryName);
            var collision = config.IndexedFolders.FirstOrDefault(f => f.MemoryId == newMemoryId && f.SourceFolder != body.Path);
            if (collision is not null)
                return Results.BadRequest(new ErrorResponse(
                    $"'{memoryName}' is al in gebruik voor een andere map ({collision.SourceFolder}). Kies een andere Memory-naam."));

            var (_, gazetteerPath, error) = LoadGazetteer(configPath,
                r => Results.BadRequest(new ErrorResponse($"Gazetteer niet gevonden op {r}. Configureer 'm eerst.")));
            if (error is not null) return error;

            var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);
            var mediaDir = Path.Combine(outputFolder, "media");
            var catalogPath = Path.Combine(outputFolder, "catalog.json");

            var run = runs.Start(state =>
            {
                // Build before touching anything already published: if this
                // throws (e.g. an unseeded Gazetteer entry), the previous
                // successful publish for this Source Folder must survive
                // untouched — never delete a working result before knowing
                // its replacement actually landed.
                var log = new RunLogWriter(state);
                var gazetteer = Gazetteer.Load(gazetteerPath);
                var built = CatalogBuilder.Build(body.Path, memoryName, destinationName, gazetteer, outputFolder, log);
                var newMemory = built.Memories[0];

                var existingCatalog = CatalogStore.Load(catalogPath);
                if (existing is not null && existing.MemoryId != newMemory.Id)
                {
                    var oldMemory = existingCatalog.Memories.FirstOrDefault(m => m.Id == existing.MemoryId);
                    existingCatalog = CatalogStore.RemoveMemory(existingCatalog, existing.MemoryId);
                    if (oldMemory is not null) CatalogStore.DeleteMediaFilesForMemory(mediaDir, oldMemory);
                }
                CatalogStore.PruneStaleMediaFiles(mediaDir, newMemory);

                var merged = CatalogStore.Replace(existingCatalog, newMemory);
                CatalogStore.Save(merged, catalogPath);

                var freshConfig = IndexerConfig.Load(configPath);
                freshConfig.RecordIndexed(body.Path, newMemory.Id, memoryName, destinationName);
                freshConfig.Save(configPath);

                state.AppendLog($"Catalogus bijgewerkt: {catalogPath}");
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

        app.MapDelete("/api/media-items", (string memoryId, string itemId) =>
        {
            var config = IndexerConfig.Load(configPath);
            var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);
            var catalogPath = Path.Combine(outputFolder, "catalog.json");
            var catalog = CatalogStore.Load(catalogPath);

            var result = CatalogStore.RemoveMediaItem(catalog, memoryId, itemId);
            if (result.Error is not null)
                return result.NotFound ? Results.NotFound(new ErrorResponse(result.Error)) : Results.BadRequest(new ErrorResponse(result.Error));

            CatalogStore.Save(result.Catalog, catalogPath);
            CatalogStore.DeleteMediaFiles(Path.Combine(outputFolder, "media"), itemId);

            return Results.Json(BuildFolderViews(configPath), JsonOptions.Default);
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

        app.MapGet("/api/settings", () => Results.Json(BuildSettingsView(configPath), JsonOptions.Default));

        app.MapPut("/api/settings/output-folder", (PathRequest body) =>
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
            return Results.Json(BuildSettingsView(configPath), JsonOptions.Default);
        });

        app.MapPut("/api/settings/source-folders-root", (PathRequest body) =>
        {
            var config = IndexerConfig.Load(configPath);
            if (!string.IsNullOrWhiteSpace(body.Path))
            {
                try
                {
                    ResolveRelativeToConfig(configPath, body.Path);
                }
                catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
                {
                    return Results.BadRequest(new ErrorResponse($"Ongeldig pad: {ex.Message}"));
                }
            }

            config.SourceFoldersRoot = body.Path ?? "";
            config.Save(configPath);
            return Results.Json(BuildSettingsView(configPath), JsonOptions.Default);
        });

        app.MapPut("/api/settings/gazetteer-path", (PathRequest body) =>
        {
            if (string.IsNullOrWhiteSpace(body.Path))
                return Results.BadRequest(new ErrorResponse("Gazetteer-pad mag niet leeg zijn."));

            var config = IndexerConfig.Load(configPath);
            config.GazetteerPath = body.Path;
            config.Save(configPath);
            return Results.Json(BuildSettingsView(configPath), JsonOptions.Default);
        });

        app.MapPost("/api/settings/gazetteer-file", () =>
        {
            var config = IndexerConfig.Load(configPath);
            var resolved = ResolveRelativeToConfig(configPath, config.GazetteerPath);
            if (File.Exists(resolved))
                return Results.BadRequest(new ErrorResponse($"Gazetteer bestaat al op {resolved}."));

            Directory.CreateDirectory(Path.GetDirectoryName(resolved)!);
            Gazetteer.CreateEmpty().Save(resolved);
            return Results.Json(BuildSettingsView(configPath), JsonOptions.Default);
        });

        app.Run();
    }

    private static List<FolderView> BuildFolderViews(string configPath)
    {
        var config = IndexerConfig.Load(configPath);
        var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);
        var catalogPath = Path.Combine(outputFolder, "catalog.json");
        var catalog = CatalogStore.Load(catalogPath);

        return config.SourceFolders.Select(path =>
        {
            var indexed = config.FindIndexed(path);
            var memory = indexed is null ? null : catalog.Memories.FirstOrDefault(m => m.Id == indexed.MemoryId);

            IndexedView? indexedView = null;
            if (indexed is not null && memory is not null)
            {
                var items = memory.Chapters
                    .SelectMany(c => c.MediaItems)
                    .Select(item => new MediaItemView(
                        item.Id,
                        "/" + item.MediaRef,
                        item.Type,
                        item.CapturedAt,
                        CatalogStore.IsCover(memory, item.Id)))
                    .ToList();

                indexedView = new IndexedView(
                    indexed.MemoryId, indexed.MemoryName, indexed.DestinationName, memory.DestinationCoordinate,
                    indexed.IndexedAt, "/" + memory.CoverImage, items);
            }

            return new FolderView(path, Directory.Exists(path), indexedView);
        }).ToList();
    }

    private static SettingsView BuildSettingsView(string configPath)
    {
        var config = IndexerConfig.Load(configPath);
        var gazetteerPath = ResolveRelativeToConfig(configPath, config.GazetteerPath);
        var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);
        var sourceFoldersRootResolved = string.IsNullOrWhiteSpace(config.SourceFoldersRoot)
            ? null
            : ResolveRelativeToConfig(configPath, config.SourceFoldersRoot);

        return new SettingsView(
            config.GazetteerPath, gazetteerPath, File.Exists(gazetteerPath),
            config.OutputFolder, outputFolder,
            config.SourceFoldersRoot, sourceFoldersRootResolved);
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

public sealed record PathRequest(string Path);

public sealed record GazetteerEntryRequest(string Name, double Lat, double Lon);

public sealed record IndexFolderRequest(string Path, string? MemoryName, string? DestinationName);

public sealed record ErrorResponse(string Error);

public sealed record MediaItemView(string Id, string Url, MediaKind Type, DateTimeOffset? CapturedAt, bool IsCover);

public sealed record IndexedView(
    string MemoryId,
    string MemoryName,
    string DestinationName,
    Coordinate DestinationCoordinate,
    DateTimeOffset IndexedAt,
    string CoverUrl,
    List<MediaItemView> MediaItems);

public sealed record FolderView(string Path, bool Exists, IndexedView? Indexed);

public sealed record SettingsView(
    string GazetteerPath, string GazetteerPathResolved, bool GazetteerExists,
    string OutputFolder, string OutputFolderResolved,
    string SourceFoldersRoot, string? SourceFoldersRootResolved);

public sealed record GazetteerView(IReadOnlyDictionary<string, Coordinate> Entries);

public sealed record RunView(RunStatus Status, List<string> Log, string? Error, string? CatalogPath);
