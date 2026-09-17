using System.IO;
using Indexer.Curation;
using Indexer.Media;

namespace Indexer.Catalog;

// One Source Folder, one Memory, split into real Chapters per #20/#31's
// two-layer heuristic (see ChapterBoundaries), with anomalies (a wrong
// camera clock, files with no capture time) surfaced and defaulted per
// #19/#33 (see AnomalyDetector) rather than silently placed on file mtime.
// The confirmation UI (#22/#34) is a later ticket — for now, every anomaly
// gets its #19-decided default handling applied automatically, non-blocking.
public static class CatalogBuilder
{
    private const double DefaultShotDuration = 4.0;

    public static RwCatalog Build(
        string sourceFolder,
        string memoryName,
        string destinationName,
        Gazetteer gazetteer,
        string outputFolder,
        string curationFolder,
        TextWriter? log = null,
        Action<int, int>? onProgress = null)
    {
        var memoryId = Slug.From(memoryName);
        log ??= Console.Out;

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
        var destinationCoordinate = gazetteer.Lookup(destinationName);

        var files = SourceFolderReader.Read(sourceFolder, log);
        if (files.Count == 0)
            throw new InvalidOperationException($"Geen ondersteunde media gevonden in {sourceFolder}.");

        using var videoReader = new VideoMetadataReader();

        // Two passes over the same file count — reading metadata (to sort
        // chronologically) and then publishing each derivative — so progress
        // covers both: step 1..N is reading, N+1..2N is publishing.
        var totalSteps = files.Count * 2;
        var stepsDone = 0;

        var read = new List<(MediaFile File, MediaKind Kind, MediaMetadata Metadata)>();
        foreach (var file in files)
        {
            var kind = file.IsVideo ? MediaKind.Video : MediaKind.Photo;
            var metadata = kind == MediaKind.Video ? videoReader.Read(file.FullPath) : PhotoMetadataReader.Read(file.FullPath);
            read.Add((file, kind, metadata));
            onProgress?.Invoke(++stepsDone, totalSteps);
        }

        var detection = AnomalyDetector.Detect(read
            .Select(entry => new AnomalyDetector.MediaFact(
                entry.File.RelativePath,
                Mtime: new DateTimeOffset(File.GetLastWriteTimeUtc(entry.File.FullPath)),
                ExifCapturedAt: entry.Metadata.CapturedAt,
                Camera: entry.Metadata.Camera))
            .ToList());

        foreach (var anomaly in detection.Anomalies) log.WriteLine(anomaly.Message);
        if (detection.Anomalies.Count > 0)
        {
            // Recomputed fresh every run rather than loaded-then-merged: no
            // operator override exists yet to preserve (#34). Once one does,
            // an operator's hand-edited Handling here must survive a re-run.
            var curation = CurationFile.CreateEmpty();
            foreach (var anomaly in detection.Anomalies)
                curation.Anomalies[anomaly.Cause] = new AnomalyRecord(anomaly.Message, anomaly.Handling, anomaly.AffectedFiles.ToList());

            // Not something the catalogue depends on — an unwritable
            // Curation-folder must not sink a run whose anomalies are
            // otherwise handled automatically and non-blockingly (see the
            // file header above).
            try
            {
                curation.Save(CurationFile.PathFor(curationFolder, memoryId));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                log.WriteLine($"Kon curatiebestand niet wegschrijven naar {curationFolder}: {ex.Message}");
            }
        }

        var ordered = read
            .Select(entry => (entry.File, entry.Kind, entry.Metadata, EffectiveCapturedAt: detection.EffectiveCapturedAt[entry.File.RelativePath]))
            .OrderBy(entry => entry.EffectiveCapturedAt)
            .ToList();

        var mediaDir = Path.Combine(outputFolder, "media");
        Directory.CreateDirectory(mediaDir);

        var chapters = new List<RwChapter>();
        var chapterMediaItems = new List<RwMediaItem>();
        Coordinate? chapterLocation = null;
        var chapterNumber = 1;
        string? coverImage = null;

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

        for (var i = 0; i < ordered.Count; i++)
        {
            var (file, kind, metadata, effectiveCapturedAt) = ordered[i];

            if (i > 0)
            {
                var previous = ordered[i - 1];
                if (ChapterBoundaries.IsBoundary(previous.EffectiveCapturedAt, previous.Metadata.Gps, effectiveCapturedAt, metadata.Gps))
                    FlushChapter();
            }

            var chapterId = $"{memoryId}-c{chapterNumber}";
            var id = $"{chapterId}-{i:D4}-{Slug.From(Path.GetFileNameWithoutExtension(file.RelativePath))}";

            var (mediaRef, shotDuration) = kind == MediaKind.Video
                ? PublishVideo(file, metadata, id, mediaDir)
                : PublishPhoto(file, metadata, id, mediaDir);
            onProgress?.Invoke(++stepsDone, totalSteps);

            if (i == 0)
            {
                // Cover = earliest Media Item chronologically (CONTEXT.md: Memory).
                if (kind == MediaKind.Video)
                {
                    throw new InvalidOperationException(
                        "Het vroegste Media Item is een video; #25 sloeg poster-frames voor de cover bewust over. " +
                        "Kies een Source Folder waarvan de eerste opname een foto is, of los dit expliciet op.");
                }

                var thumbFileName = $"{id}-thumb.jpg";
                DerivativeGenerator.GeneratePinThumbnail(file.FullPath, Path.Combine(mediaDir, thumbFileName));
                coverImage = $"media/{thumbFileName}";
            }

            chapterMediaItems.Add(new RwMediaItem
            {
                Id = id,
                MediaRef = mediaRef,
                Type = kind,
                CapturedAt = metadata.CapturedAt,
                StoryRect = StoryRectFormula.Compute(metadata.Width, metadata.Height, i),
                ShotDuration = shotDuration,
            });
            // A Chapter has a location as soon as any of its Media Items
            // carries GPS (CONTEXT.md: Chapter) — first one found wins.
            chapterLocation ??= metadata.Gps;
        }
        FlushChapter();

        var memory = new RwMemory
        {
            Id = memoryId,
            Name = memoryName,
            DestinationName = destinationName,
            DestinationCoordinate = destinationCoordinate,
            CoverImage = coverImage!,
            Chapters = chapters,
        };

        return new RwCatalog { Memories = [memory] };
    }

    private static (string MediaRef, double ShotDuration) PublishPhoto(MediaFile file, MediaMetadata metadata, string id, string mediaDir)
    {
        var fileName = $"{id}-story.jpg";
        DerivativeGenerator.GenerateStoryDerivative(file.FullPath, metadata.Width, Path.Combine(mediaDir, fileName));
        return ($"media/{fileName}", DefaultShotDuration);
    }

    private static (string MediaRef, double ShotDuration) PublishVideo(MediaFile file, MediaMetadata metadata, string id, string mediaDir)
    {
        // Original 1080p file, unmodified — no transcoding, no poster frame (#25).
        var fileName = $"{id}{Path.GetExtension(file.FullPath).ToLowerInvariant()}";
        File.Copy(file.FullPath, Path.Combine(mediaDir, fileName), overwrite: true);
        return ($"media/{fileName}", metadata.Duration?.TotalSeconds ?? DefaultShotDuration);
    }

    // Best-effort: an unwritable Curation-folder is the exact scenario the
    // curation-file save below already guards the run against, so opening
    // its log file must not itself sink the run.
    private static StreamWriter? TryOpenLogFile(string curationFolder, string memoryId, TextWriter log)
    {
        try
        {
            Directory.CreateDirectory(curationFolder);
            return new StreamWriter(Path.Combine(curationFolder, $"{memoryId}.log"), append: false) { AutoFlush = true };
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
