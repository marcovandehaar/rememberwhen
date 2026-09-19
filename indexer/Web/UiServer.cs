using System.Diagnostics;
using System.IO;
using System.Net.Http;
using Indexer.Catalog;
using Indexer.Config;
using Indexer.Media;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;
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

        // Nominatim's usage policy asks for an identifying User-Agent — a
        // plain browser fetch can't set that header, so the "Suggest
        // coordinate" button (#42) goes through this server-side client
        // instead of calling Nominatim directly from app.js.
        builder.Services.AddHttpClient<NominatimClient>(client =>
        {
            client.BaseAddress = new Uri("https://nominatim.openstreetmap.org/");
            client.DefaultRequestHeaders.UserAgent.ParseAdd("rememberwhen-indexer/1.0 (+https://github.com/marcovandehaar/rememberwhen)");
        });

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
            // #44: Load, mutate and Save must happen as one uninterrupted
            // transaction, or another request's own Load/Save could land in
            // between and either race on the file handle or get overwritten.
            lock (CatalogStore.Gate)
            {
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
            }
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
            var curationFolder = ResolveRelativeToConfig(configPath, config.CurationFolder);

            var run = runs.Start(state =>
            {
                // Build before touching anything already published: if this
                // throws (e.g. an unseeded Gazetteer entry), the previous
                // successful publish for this Source Folder must survive
                // untouched — never delete a working result before knowing
                // its replacement actually landed.
                var log = new RunLogWriter(state);
                var gazetteer = Gazetteer.Load(gazetteerPath);
                var built = CatalogBuilder.Build(body.Path, memoryName, destinationName, gazetteer, outputFolder, curationFolder, log,
                    onProgress: state.SetProgress, cancellationToken: state.CancellationToken);
                var newMemory = built.Memories[0];

                // #44: same reasoning as the other handlers — Load through
                // Save is one transaction, so a request reviewing/removing
                // photos from an already-published Memory while this run is
                // still writing can't race it.
                lock (CatalogStore.Gate)
                {
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
                }

                var freshConfig = IndexerConfig.Load(configPath);
                freshConfig.RecordIndexed(body.Path, newMemory.Id, memoryName, destinationName);
                freshConfig.Save(configPath);

                state.AppendLog($"Catalogus bijgewerkt: {catalogPath}");
                state.MarkSucceeded(catalogPath);
            });

            return Results.Json(new { runId = run.Id }, JsonOptions.Default);
        });

        app.MapPost("/api/deploy", () =>
        {
            var repoRoot = DeployRun.FindRepoRoot(configPath);
            var scriptPath = Path.Combine(repoRoot, "deploy-nas.ps1");
            if (!File.Exists(scriptPath))
                return Results.BadRequest(new ErrorResponse($"deploy-nas.ps1 niet gevonden op {scriptPath}."));

            var run = runs.Start(state =>
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "pwsh",
                    WorkingDirectory = repoRoot,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                psi.ArgumentList.Add("-NoProfile");
                psi.ArgumentList.Add("-File");
                psi.ArgumentList.Add(scriptPath);

                using var process = new Process { StartInfo = psi };
                process.Start();
                // A hard kill, not the cooperative unwind CatalogBuilder gets —
                // deploy-nas.ps1 has no notion of "stop between files", and
                // re-running it later is safe regardless (rm -f + scp per
                // file, same as any other rerun).
                using var killOnCancel = state.CancellationToken.Register(() =>
                {
                    try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
                });

                // deploy-nas.ps1 emits "PROGRESS <done> <total>" lines for the
                // bar (see there) alongside its normal human-readable
                // Write-Host section headers, which go straight to the log —
                // same split CatalogBuilder already has between its
                // onProgress callback and its log writer.
                string? line;
                while ((line = process.StandardOutput.ReadLine()) is not null)
                {
                    var progress = DeployRun.ParseProgressLine(line);
                    if (progress is { } p)
                        state.SetProgress(p.Done, p.Total);
                    else
                        state.AppendLog(DeployRun.StripAnsi(line));
                }

                var stderr = process.StandardError.ReadToEnd();
                process.WaitForExit();

                if (state.CancellationToken.IsCancellationRequested)
                    throw new OperationCanceledException(state.CancellationToken);
                if (process.ExitCode != 0)
                {
                    foreach (var stderrLine in stderr.Split('\n'))
                    {
                        var trimmed = DeployRun.StripAnsi(stderrLine).Trim();
                        if (trimmed.Length > 0) state.AppendLog(trimmed);
                    }
                    throw new InvalidOperationException($"deploy-nas.ps1 gaf exitcode {process.ExitCode}.");
                }

                state.AppendLog("Gepubliceerd.");
                state.MarkSucceeded(scriptPath);
            });

            return Results.Json(new { runId = run.Id }, JsonOptions.Default);
        });

        app.MapGet("/api/runs/{id}", (string id) =>
        {
            var run = runs.Get(id);
            if (run is null) return Results.NotFound(new ErrorResponse("Onbekende run."));

            return Results.Json(
                new RunView(run.Status, run.SnapshotLog(), run.Error, run.CatalogPath, run.ProgressCurrent, run.ProgressTotal),
                JsonOptions.Default);
        });

        app.MapPost("/api/runs/{id}/cancel", (string id) =>
        {
            var run = runs.Get(id);
            if (run is null) return Results.NotFound(new ErrorResponse("Onbekende run."));

            // Cooperative — CatalogBuilder.Build notices between files and
            // unwinds, cleaning up what it wrote for this run (see there).
            // Nothing already published before this run started is touched:
            // the catalogue is only replaced after Build returns.
            run.RequestCancel();
            return Results.Json(
                new RunView(run.Status, run.SnapshotLog(), run.Error, run.CatalogPath, run.ProgressCurrent, run.ProgressTotal),
                JsonOptions.Default);
        });

        app.MapDelete("/api/media-items", (string memoryId, string itemId) =>
        {
            var config = IndexerConfig.Load(configPath);
            var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);
            var catalogPath = Path.Combine(outputFolder, "catalog.json");

            lock (CatalogStore.Gate) // #44
            {
                var catalog = CatalogStore.Load(catalogPath);

                var result = CatalogStore.RemoveMediaItem(catalog, memoryId, itemId);
                if (result.Error is not null)
                    return result.NotFound ? Results.NotFound(new ErrorResponse(result.Error)) : Results.BadRequest(new ErrorResponse(result.Error));

                CatalogStore.Save(result.Catalog, catalogPath);
                CatalogStore.DeleteMediaFiles(Path.Combine(outputFolder, "media"), itemId);

                return Results.Json(BuildFolderViews(configPath), JsonOptions.Default);
            }
        });

        app.MapPut("/api/media-items/cover", (SetCoverRequest body) =>
        {
            var config = IndexerConfig.Load(configPath);
            var outputFolder = ResolveRelativeToConfig(configPath, config.OutputFolder);
            var mediaDir = Path.Combine(outputFolder, "media");
            var catalogPath = Path.Combine(outputFolder, "catalog.json");

            lock (CatalogStore.Gate) // #44
            {
                var catalog = CatalogStore.Load(catalogPath);

                var memory = catalog.Memories.FirstOrDefault(m => m.Id == body.MemoryId);
                if (memory is null) return Results.NotFound(new ErrorResponse("Onbekende Memory."));

                var item = memory.Chapters.SelectMany(c => c.MediaItems).FirstOrDefault(i => i.Id == body.ItemId);
                if (item is null) return Results.NotFound(new ErrorResponse("Onbekend Media Item."));

                if (CatalogStore.IsCover(memory, item.Id))
                    return Results.Json(BuildFolderViews(configPath), JsonOptions.Default);
                if (item.Type == MediaKind.Video)
                    return Results.BadRequest(new ErrorResponse("Een video kan geen cover zijn."));

                // From the item's own already-published derivative, same as the
                // rest of this review screen — never the original source file.
                var thumbFileName = $"{item.Id}-thumb.jpg";
                DerivativeGenerator.GeneratePinThumbnail(
                    Path.Combine(outputFolder, item.MediaRef), Path.Combine(mediaDir, thumbFileName));

                var oldCoverPath = Path.Combine(outputFolder, memory.CoverImage);
                var updated = CatalogStore.SetCover(catalog, memory.Id, $"media/{thumbFileName}");
                CatalogStore.Save(updated, catalogPath);

                // Only after the replacement is confirmed on disk — same
                // build-before-delete ordering as everywhere else here.
                if (File.Exists(oldCoverPath)) File.Delete(oldCoverPath);

                return Results.Json(BuildFolderViews(configPath), JsonOptions.Default);
            }
        });

        app.MapGet("/api/gazetteer", () =>
        {
            var (gazetteer, _, error) = LoadGazetteer(configPath,
                resolved => Results.NotFound(new ErrorResponse($"Gazetteer niet gevonden op {resolved}.")));
            if (error is not null) return error;

            return Results.Json(new GazetteerView(gazetteer!.Entries), JsonOptions.Default);
        });

        app.MapGet("/api/gazetteer/suggest", async (string name, NominatimClient nominatim, CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(name))
                return Results.BadRequest(new ErrorResponse("Destination-naam mag niet leeg zijn."));

            NominatimSuggestion? suggestion;
            try
            {
                suggestion = await nominatim.Search(name, cancellationToken);
            }
            catch (HttpRequestException ex)
            {
                return Results.Json(new ErrorResponse($"Nominatim niet bereikbaar: {ex.Message}"), JsonOptions.Default, statusCode: 502);
            }

            return suggestion is null
                ? Results.NotFound(new ErrorResponse($"Geen resultaat gevonden voor '{name}'."))
                : Results.Json(suggestion, JsonOptions.Default);
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

        app.MapPut("/api/settings/curation-folder", (PathRequest body) =>
        {
            if (string.IsNullOrWhiteSpace(body.Path))
                return Results.BadRequest(new ErrorResponse("Curatie- en logs-locatie mag niet leeg zijn."));

            try
            {
                ResolveRelativeToConfig(configPath, body.Path);
            }
            catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
            {
                return Results.BadRequest(new ErrorResponse($"Ongeldig pad: {ex.Message}"));
            }

            var config = IndexerConfig.Load(configPath);
            config.CurationFolder = body.Path;
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

        app.MapPut("/api/settings/nas-credentials", (NasCredentialsRequest body) =>
        {
            var config = IndexerConfig.Load(configPath);
            var host = UncHost(config.SourceFoldersRoot);
            if (host is null)
                return Results.BadRequest(new ErrorResponse(
                    "Stel eerst een Source Folders-basismap in met een netwerkpad (\\\\server\\...)."));
            if (string.IsNullOrWhiteSpace(body.Username))
                return Results.BadRequest(new ErrorResponse("Gebruikersnaam mag niet leeg zijn."));
            if (string.IsNullOrWhiteSpace(body.Password))
                return Results.BadRequest(new ErrorResponse("Wachtwoord mag niet leeg zijn."));

            try
            {
                CredentialStore.Save(host, body.Username, body.Password);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new ErrorResponse(ex.Message));
            }

            return Results.Json(BuildSettingsView(configPath), JsonOptions.Default);
        });

        app.MapDelete("/api/settings/nas-credentials", () =>
        {
            var config = IndexerConfig.Load(configPath);
            var host = UncHost(config.SourceFoldersRoot);
            if (host is not null) CredentialStore.Delete(host);
            return Results.Json(BuildSettingsView(configPath), JsonOptions.Default);
        });

        app.MapPost("/api/settings/test-connection", () =>
        {
            var config = IndexerConfig.Load(configPath);
            var host = UncHost(config.SourceFoldersRoot);
            if (host is null)
                return Results.BadRequest(new ErrorResponse(
                    "Stel eerst een Source Folders-basismap in met een netwerkpad (\\\\server\\...)."));

            var lines = new List<string>();
            var ok = true;

            var sourceRoot = ResolveRelativeToConfig(configPath, config.SourceFoldersRoot);
            try
            {
                // Directory.Exists swallows UnauthorizedAccessException/IOException and just
                // returns false, which would mask exactly the failures this button exists to
                // catch (bad credentials, an unreachable share) behind a generic "not found".
                // Calling GetDirectories directly lets those specific exceptions surface.
                var folderCount = Directory.GetDirectories(sourceRoot).Length;
                lines.Add($"Source Folders-basismap: verbinding gelukt — {folderCount} map(pen) gevonden op {host}.");
            }
            catch (Exception ex) when (ex is DirectoryNotFoundException or UnauthorizedAccessException or IOException)
            {
                ok = false;
                lines.Add($"Source Folders-basismap: {ex.Message}");
            }

            // The NAS user has scoped read/write, and this credential applies
            // per host, not per path — so when a write location is on the
            // same NAS, it's covered automatically. Test it the same way:
            // for real, not just "is it configured". A write test, not a read
            // test, since that's what indexing actually needs there.
            void TestWriteAccess(string label, string resolved)
            {
                if (UncHost(resolved) is not { } writeHost) return;

                try
                {
                    Directory.CreateDirectory(resolved);
                    var marker = Path.Combine(resolved, $".rememberwhen-test-{Guid.NewGuid():n}");
                    File.WriteAllText(marker, "");
                    File.Delete(marker);
                    lines.Add($"{label}: schrijftoegang bevestigd op {writeHost}.");
                }
                catch (Exception ex) when (ex is DirectoryNotFoundException or UnauthorizedAccessException or IOException)
                {
                    ok = false;
                    lines.Add($"{label}: {ex.Message}");
                }
            }

            TestWriteAccess("Output-locatie", ResolveRelativeToConfig(configPath, config.OutputFolder));
            TestWriteAccess("Curatie- en logs-locatie", ResolveRelativeToConfig(configPath, config.CurationFolder));

            var message = string.Join("\n", lines);
            return ok ? Results.Json(new TestConnectionResult(message)) : Results.BadRequest(new ErrorResponse(message));
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
        var curationFolder = ResolveRelativeToConfig(configPath, config.CurationFolder);
        var sourceFoldersRootResolved = string.IsNullOrWhiteSpace(config.SourceFoldersRoot)
            ? null
            : ResolveRelativeToConfig(configPath, config.SourceFoldersRoot);
        var nasCredentialsHost = UncHost(config.SourceFoldersRoot);

        return new SettingsView(
            config.GazetteerPath, gazetteerPath, File.Exists(gazetteerPath),
            config.OutputFolder, outputFolder,
            config.CurationFolder, curationFolder,
            config.SourceFoldersRoot, sourceFoldersRootResolved,
            nasCredentialsHost, nasCredentialsHost is null ? null : CredentialStore.TryGetUsername(nasCredentialsHost));
    }

    // \\server\share\... -> "server". Null for anything not shaped like a
    // UNC path (a local drive letter has no server to hold credentials for).
    private static string? UncHost(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !path.StartsWith(@"\\", StringComparison.Ordinal)) return null;

        var trimmed = path.TrimStart('\\');
        var separatorIndex = trimmed.IndexOfAny(['\\', '/']);
        var host = separatorIndex < 0 ? trimmed : trimmed[..separatorIndex];
        return string.IsNullOrWhiteSpace(host) ? null : host;
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

public sealed record SetCoverRequest(string MemoryId, string ItemId);

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
    string CurationFolder, string CurationFolderResolved,
    string SourceFoldersRoot, string? SourceFoldersRootResolved,
    string? NasCredentialsHost, string? NasCredentialsUsername);

public sealed record NasCredentialsRequest(string Username, string Password);

public sealed record TestConnectionResult(string Message);

public sealed record GazetteerView(IReadOnlyDictionary<string, Coordinate> Entries);

public sealed record RunView(
    RunStatus Status, List<string> Log, string? Error, string? CatalogPath,
    int? ProgressCurrent, int? ProgressTotal);
