using System.IO;
using Indexer.Curation;
using Indexer.Media;

namespace Indexer.Catalog;

// One Memory from all its Source Folders (#64: their files pool into one
// chronological sequence), split into real Chapters per #20/#31's
// two-layer heuristic (see ChapterBoundaries), with anomalies (a wrong
// camera clock, files with no capture time) surfaced and defaulted per
// #19/#33 (see AnomalyDetector) rather than silently placed on file mtime.
// The confirmation UI (#22/#34) is a later ticket — for now, every anomaly
// gets its #19-decided default handling applied automatically, non-blocking.
public static class CatalogBuilder
{
    private const double DefaultShotDuration = 4.0;

    // The one-folder form, kept for the CLI and the many callers that only have one.
    public static RwCatalog Build(
        string sourceFolder,
        string memoryName,
        string? destinationName,
        Gazetteer gazetteer,
        string outputFolder,
        string curationFolder,
        TextWriter? log = null,
        Action<int, int>? onProgress = null,
        CancellationToken cancellationToken = default,
        string? ffmpegPath = null,
        TimeSpan? retryDelay = null) =>
        Build([sourceFolder], memoryName, destinationName, gazetteer, outputFolder, curationFolder, log, onProgress, cancellationToken, ffmpegPath, retryDelay);

    public static RwCatalog Build(
        IReadOnlyList<string> sourceFolders,
        string memoryName,
        // Null: the Memory is not a Trip, so there is nothing to look up in the Gazetteer.
        string? destinationName,
        Gazetteer gazetteer,
        string outputFolder,
        string curationFolder,
        TextWriter? log = null,
        Action<int, int>? onProgress = null,
        CancellationToken cancellationToken = default,
        // Empty/null: an HDR clip (#48) publishes unchanged, logged, rather
        // than blocking the run — same non-blocking spirit as every other
        // anomaly this builder handles.
        string? ffmpegPath = null,
        // Base wait between attempts of a failing file read (multiplied by
        // the attempt number); tests pass zero.
        TimeSpan? retryDelay = null)
    {
        var memoryId = Slug.From(memoryName);
        log ??= Console.Out;
        var delay = retryDelay ?? TimeSpan.FromSeconds(1);

        // Persists every line written to `log` for later inspection, in
        // addition to wherever the caller's own writer already sends it
        // (console, or the web UI's live run view) — see CurationFile.cs's
        // header for why this folder exists instead of writing next to the
        // Source Folder.
        using var logFileWriter = TryOpenLogFile(curationFolder, memoryId, log);
        if (logFileWriter is not null) log = new TeeTextWriter(log, logFileWriter);

        // Cheap and fast, so it goes first: an unseeded Destination fails here
        // instead of after the slow read-and-publish pass over every file,
        // which can take minutes over a NAS share (#38).
        var destinationCoordinate = destinationName is null ? (Coordinate?)null : gazetteer.Lookup(destinationName);

        var where = string.Join(", ", sourceFolders);
        var files = SourceFolderReader.ReadAll(sourceFolders, log);
        if (files.Count == 0)
            throw new InvalidOperationException($"Geen ondersteunde media gevonden in {where}.");

        // The operator's edits (#66): removed photos, the chosen cover and
        // rotations, keyed by source file so they survive a reindex and the
        // ids shifting when a folder is added. An edit whose file has
        // vanished is dropped; one for a file still there is reapplied.
        var curationPath = CurationFile.PathFor(curationFolder, memoryId);
        var curation = CurationFile.Load(curationPath);
        var inPool = files.Select(f => f.FullPath).ToHashSet(StringComparer.OrdinalIgnoreCase);
        // An edit is only dropped when its file is really gone: still on disk (say, in a folder taken out
        // of this Memory) or in a folder that cannot be reached right now (a NAS that is offline) keeps it.
        bool StillThere(string path) =>
            inPool.Contains(path) || File.Exists(path) || !Directory.Exists(Path.GetDirectoryName(path));
        var droppedEdits = curation.DropMissing(StillThere);
        if (droppedEdits > 0) log.WriteLine($"{droppedEdits} bewerking(en) van bestanden die niet meer bestaan zijn vergeten.");
        var skippedByOperator = files.Where(f => curation.RemovedFiles.Contains(f.FullPath)).ToList();
        if (skippedByOperator.Count > 0)
        {
            files = [.. files.Except(skippedByOperator)];
            log.WriteLine($"{skippedByOperator.Count} bestand(en) overgeslagen omdat ze eerder verwijderd zijn.");
            if (files.Count == 0)
                throw new InvalidOperationException($"Alle bestanden in {where} zijn eerder verwijderd uit deze Memory.");
        }

        // Cover = the earliest Media Item that's a photo (CONTEXT.md: Memory
        // calls it "the photo shown on its globe pin" — a video can't be
        // one). Cheap to know from the extension alone, so — like the
        // Gazetteer lookup above — this is checked before the slow
        // read-and-publish pass rather than discovered partway through it.
        if (files.All(f => f.IsVideo))
            throw new InvalidOperationException(
                $"Geen enkele foto in {where}: de cover is altijd een foto (CONTEXT.md: Memory), en deze map bevat alleen video's.");

        using var videoReader = new VideoMetadataReader();

        // Two passes over the same file count — reading metadata (to sort
        // chronologically) and then publishing each derivative — so progress
        // covers both: step 1..N is reading, N+1..2N is publishing.
        var totalSteps = files.Count * 2;
        var stepsDone = 0;

        var read = new List<(MediaFile File, MediaKind Kind, MediaMetadata Metadata)>();
        var skipped = new List<string>();
        foreach (var file in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var kind = file.IsVideo ? MediaKind.Video : MediaKind.Photo;
            if (TryWithRetry(
                    () => kind == MediaKind.Video ? videoReader.Read(file.FullPath) : PhotoMetadataReader.Read(file.FullPath),
                    file.RelativePath, delay, log, cancellationToken, out var metadata))
                read.Add((file, kind, metadata));
            else
                skipped.Add(file.RelativePath);
            onProgress?.Invoke(++stepsDone, totalSteps);
        }

        if (read.Count == 0)
            throw new InvalidOperationException($"Geen enkel bestand in {where} was leesbaar; zie de regels hierboven.");
        if (read.All(entry => entry.Kind == MediaKind.Video))
            throw new InvalidOperationException(
                $"Geen enkele foto in {where} was leesbaar: de cover is altijd een foto (CONTEXT.md: Memory).");

        var detection = AnomalyDetector.Detect(read
            .Select(entry => new AnomalyDetector.MediaFact(
                entry.File.RelativePath,
                Mtime: new DateTimeOffset(File.GetLastWriteTimeUtc(entry.File.FullPath)),
                ExifCapturedAt: entry.Metadata.CapturedAt,
                Camera: entry.Metadata.Camera))
            .ToList());

        foreach (var anomaly in detection.Anomalies) log.WriteLine(anomaly.Message);

        // Anomalies are recomputed fresh every run and saved next to the operator's edits.
        // Not something the catalogue depends on — an unwritable Curation-folder must not
        // sink a run whose anomalies are otherwise handled automatically and non-blockingly.
        var anomalies = detection.Anomalies.ToDictionary(
            anomaly => anomaly.Cause,
            anomaly => new AnomalyRecord(anomaly.Message, anomaly.Handling, anomaly.AffectedFiles.ToList()));
        try
        {
            lock (CatalogStore.Gate)
                CurationFile.SaveBuildResult(curationPath, anomalies, StillThere);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            log.WriteLine($"Kon curatiebestand niet wegschrijven naar {curationFolder}: {ex.Message}");
        }

        var ordered = read
            .Select(entry => (entry.File, entry.Kind, entry.Metadata, EffectiveCapturedAt: detection.EffectiveCapturedAt[entry.File.RelativePath]))
            .OrderBy(entry => entry.EffectiveCapturedAt)
            .ToList();

        var mediaDir = Path.Combine(outputFolder, "media");
        Directory.CreateDirectory(mediaDir);

        // Guaranteed to find one — the all-video check above already ruled
        // out the only way it couldn't.
        var coverIndex = curation.CoverFile is { } chosenCover
            ? ordered.FindIndex(entry => entry.Kind == MediaKind.Photo && string.Equals(entry.File.FullPath, chosenCover, StringComparison.OrdinalIgnoreCase))
            : -1;
        if (coverIndex < 0) coverIndex = ordered.FindIndex(entry => entry.Kind == MediaKind.Photo);

        var chapters = new List<RwChapter>();
        var chapterMediaItems = new List<RwMediaItem>();
        Coordinate? chapterLocation = null;
        var chapterNumber = 1;
        string? coverImage = null;
        string? coverPhoto = null;

        void FlushChapter()
        {
            if (chapterMediaItems.Count == 0) return;
            chapters.Add(new RwChapter
            {
                Id = $"{memoryId}-c{chapterNumber}",
                Location = chapterLocation,
                MediaItems = chapterMediaItems,
            });
            chapterNumber++;
            chapterMediaItems = [];
            chapterLocation = null;
        }

        // Tracks only newly-created files, not ones this run overwrote —
        // reindexing an already-published Source Folder regenerates the
        // same filenames the live catalogue still references, and deleting
        // those on cancellation would leave that catalogue pointing at
        // nothing. Cancelling a first-time index, where every file here is
        // new, cleans up everything it wrote.
        var newlyWrittenFiles = new List<string>();
        var itemSources = new Dictionary<string, string>();
        try
        {
            for (var i = 0; i < ordered.Count; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var (file, kind, metadata, effectiveCapturedAt) = ordered[i];

                if (i > 0)
                {
                    var previous = ordered[i - 1];
                    if (ChapterBoundaries.IsBoundary(previous.EffectiveCapturedAt, previous.Metadata.Gps, effectiveCapturedAt, metadata.Gps))
                        FlushChapter();
                }

                var chapterId = $"{memoryId}-c{chapterNumber}";
                var id = $"{chapterId}-{i:D4}-{Slug.From(Path.GetFileNameWithoutExtension(file.RelativePath))}";

                // The cover's pin thumbnail and mid-size cover are part of the same attempt: a
                // photo whose pixels won't decode can't be the cover either.
                var isCover = i == coverIndex;
                if (!TryWithRetry(() =>
                    {
                        var published = kind == MediaKind.Video
                            ? PublishVideo(file, metadata, id, mediaDir, ffmpegPath, log)
                            : PublishPhoto(file, metadata, id, mediaDir);

                        // A rotation the operator chose is applied to the fresh
                        // derivative, never accumulated on the previous one.
                        var storyPath = Path.Combine(outputFolder, published.MediaRef);
                        var rotated = kind == MediaKind.Photo && curation.Rotations.TryGetValue(file.FullPath, out var degrees)
                            ? DerivativeGenerator.RotatePhoto(storyPath, degrees)
                            : ((int Width, int Height)?)null;
                        string? thumb = null, photo = null;
                        var thumbIsNew = false;
                        var photoIsNew = false;
                        if (isCover)
                        {
                            var thumbPath = Path.Combine(mediaDir, $"{id}-thumb.jpg");
                            thumbIsNew = !File.Exists(thumbPath);
                            var coverSource = rotated is null ? file.FullPath : storyPath;
                            DerivativeGenerator.GeneratePinThumbnail(coverSource, thumbPath);
                            thumb = thumbPath;

                            var photoPath = Path.Combine(mediaDir, $"{id}-cover.jpg");
                            photoIsNew = !File.Exists(photoPath);
                            DerivativeGenerator.GenerateCoverPhoto(coverSource, photoPath);
                            photo = photoPath;
                        }
                        return (published, thumb, thumbIsNew, photo, photoIsNew, rotated);
                    }, file.RelativePath, delay, log, cancellationToken, out var result))
                {
                    skipped.Add(file.RelativePath);
                    if (isCover) coverIndex = ordered.FindIndex(i + 1, entry => entry.Kind == MediaKind.Photo);
                    onProgress?.Invoke(++stepsDone, totalSteps);
                    continue;
                }

                var (mediaRef, shotDuration, isNew) = result.published;
                if (isNew) newlyWrittenFiles.Add(Path.Combine(outputFolder, mediaRef));
                onProgress?.Invoke(++stepsDone, totalSteps);

                if (result.thumb is not null)
                {
                    if (result.thumbIsNew) newlyWrittenFiles.Add(result.thumb);
                    coverImage = $"media/{id}-thumb.jpg";
                    coverPhoto = $"media/{id}-cover.jpg";
                    if (result.photoIsNew) newlyWrittenFiles.Add(result.photo!);
                }

                chapterMediaItems.Add(new RwMediaItem
                {
                    Id = id,
                    MediaRef = mediaRef,
                    Type = kind,
                    CapturedAt = metadata.CapturedAt,
                    StoryRect = StoryRectFormula.Compute(result.rotated?.Width ?? metadata.Width, result.rotated?.Height ?? metadata.Height, i),
                    ShotDuration = shotDuration,
                });
                itemSources[id] = file.FullPath;
                // A Chapter has a location as soon as any of its Media Items
                // carries GPS (CONTEXT.md: Chapter) — first one found wins.
                chapterLocation ??= metadata.Gps;
            }
            FlushChapter();

            // Rewritten on every build: the private link from a Media Item id
            // back to its source file (ADR 0008), never part of catalog.json.
            try
            {
                ItemMap.Save(ItemMap.PathFor(curationFolder, memoryId), itemSources);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                log.WriteLine($"Kon de item-map niet wegschrijven naar {curationFolder}: {ex.Message}");
            }
        }
        catch (OperationCanceledException)
        {
            foreach (var path in newlyWrittenFiles)
            {
                try { File.Delete(path); }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { }
            }
            throw;
        }

        if (coverImage is null)
            throw new InvalidOperationException(
                $"Geen enkele foto in {where} kon als cover worden gepubliceerd; zie de regels hierboven.");

        if (skipped.Count > 0)
            log.WriteLine($"Let op: {skipped.Count} bestand(en) overgeslagen en niet in deze Memory opgenomen: {string.Join(", ", skipped)}");

        var memory = new RwMemory
        {
            Id = memoryId,
            Name = memoryName,
            Destination = destinationName is null ? null : new RwDestination(destinationName, destinationCoordinate!.Value),
            // Corrected capture time, not the raw EXIF one: a reset camera
            // clock would otherwise date the whole Memory months too early.
            Date = DateOnly.FromDateTime(ordered[0].EffectiveCapturedAt.DateTime),
            CoverImage = coverImage!,
            CoverPhoto = coverPhoto,
            Chapters = chapters,
        };

        return new RwCatalog { Memories = [memory] };
    }

    // A share drops a read now and then, and WIC reports that as "the image
    // decoder cannot decode the image" without ever naming the file — so one
    // hiccup used to fail a run of hundreds, with nothing to say where.
    // Retrying costs seconds; a file that still won't read after a few
    // attempts is skipped and named, in the same non-blocking spirit as every
    // other anomaly here, instead of sinking the run.
    private const int ReadAttempts = 3;

    private static bool TryWithRetry<T>(Func<T> action, string relativePath, TimeSpan delay, TextWriter log,
        CancellationToken cancellationToken, out T result)
    {
        for (var attempt = 1; ; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                result = action();
                return true;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                if (attempt == ReadAttempts)
                {
                    log.WriteLine($"Overgeslagen (onleesbaar na {ReadAttempts} pogingen): {relativePath} — {ex.Message}");
                    result = default!;
                    return false;
                }
                Thread.Sleep(delay * attempt);
            }
        }
    }

    private static (string MediaRef, double ShotDuration, bool IsNew) PublishPhoto(MediaFile file, MediaMetadata metadata, string id, string mediaDir)
    {
        var fileName = $"{id}-story.jpg";
        var path = Path.Combine(mediaDir, fileName);
        var isNew = !File.Exists(path);
        DerivativeGenerator.GenerateStoryDerivative(file.FullPath, metadata.Width, path);
        return ($"media/{fileName}", DefaultShotDuration, isNew);
    }

    // Original 1080p file, unmodified — no poster frame (#25). The one
    // exception is HDR (#48): an untouched Dolby Vision/HLG clip renders
    // severely overexposed in a plain <video> tag, so that case alone gets
    // tone-mapped to SDR H.264 before publishing; everything else still
    // takes the cheap 1-on-1 copy.
    private static (string MediaRef, double ShotDuration, bool IsNew) PublishVideo(
        MediaFile file, MediaMetadata metadata, string id, string mediaDir, string? ffmpegPath, TextWriter log)
    {
        if (HdrVideoDetector.IsHdr(file.FullPath))
        {
            if (string.IsNullOrWhiteSpace(ffmpegPath))
            {
                log.WriteLine($"HDR-video gedetecteerd maar geen ffmpegPath ingesteld, ongewijzigd gepubliceerd: {file.RelativePath}");
            }
            else
            {
                var sdrFileName = $"{id}.mp4";
                var sdrPath = Path.Combine(mediaDir, sdrFileName);
                var sdrIsNew = !File.Exists(sdrPath);
                try
                {
                    HdrTranscoder.ToneMapToSdr(ffmpegPath, file.FullPath, sdrPath);
                    return ($"media/{sdrFileName}", metadata.Duration?.TotalSeconds ?? DefaultShotDuration, sdrIsNew);
                }
                catch (Exception ex) when (ex is InvalidOperationException or IOException)
                {
                    log.WriteLine($"HDR-tone-mapping mislukt voor {file.RelativePath}, ongewijzigd gepubliceerd: {ex.Message}");
                }
            }
        }

        var fileName = $"{id}{Path.GetExtension(file.FullPath).ToLowerInvariant()}";
        var path = Path.Combine(mediaDir, fileName);
        var isNew = !File.Exists(path);
        File.Copy(file.FullPath, path, overwrite: true);
        return ($"media/{fileName}", metadata.Duration?.TotalSeconds ?? DefaultShotDuration, isNew);
    }

    public static string LogPathFor(string curationFolder, string memoryId) =>
        Path.Combine(curationFolder, $"{memoryId}.log");

    // An exception thrown out of Build (or out of the publish steps after it)
    // never passes through Build's `log`, so the log file the UI points at
    // would hold no trace of why the run failed. Appended after Build has
    // closed its own writer; best-effort like the rest of the log.
    public static void AppendFailure(string curationFolder, string memoryId, Exception ex)
    {
        try
        {
            Directory.CreateDirectory(curationFolder);
            File.AppendAllText(LogPathFor(curationFolder, memoryId), $"Mislukt: {ex}{Environment.NewLine}");
        }
        catch (Exception writeEx) when (writeEx is IOException or UnauthorizedAccessException) { }
    }

    // Best-effort: an unwritable Curation-folder is the exact scenario the
    // curation-file save below already guards the run against, so opening
    // its log file must not itself sink the run.
    private static StreamWriter? TryOpenLogFile(string curationFolder, string memoryId, TextWriter log)
    {
        try
        {
            Directory.CreateDirectory(curationFolder);
            return new StreamWriter(LogPathFor(curationFolder, memoryId), append: false) { AutoFlush = true };
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            log.WriteLine($"Kon logbestand niet wegschrijven naar {curationFolder}: {ex.Message}");
            return null;
        }
    }
}

// Mirrors every WriteLine onto a second writer, so a run's log reaches both
// its caller (console, or the web UI's live RunLogWriter) and a persisted
// file in the Curation-folder — without every call site having to know
// about the file.
public sealed class TeeTextWriter(TextWriter primary, TextWriter secondary) : TextWriter
{
    public override System.Text.Encoding Encoding => primary.Encoding;

    public override void WriteLine(string? value)
    {
        primary.WriteLine(value);
        secondary.WriteLine(value);
    }

    public override void Write(char value) =>
        throw new NotSupportedException($"{nameof(TeeTextWriter)} only supports WriteLine(string).");
}
