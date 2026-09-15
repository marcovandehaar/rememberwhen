using System.IO;
using Indexer.Media;

namespace Indexer.Catalog;

// One Source Folder, one Memory, split into real Chapters per #20/#31's
// two-layer heuristic (see ChapterBoundaries). Anomaly detection (#19/#33)
// and the confirmation UI (#22/#34) are later tickets — a missing capture
// time here falls back to the file's own timestamp rather than being
// reported, which is a stopgap those tickets are explicitly allowed to
// leave behind.
public static class CatalogBuilder
{
    private const double DefaultShotDuration = 4.0;

    public static RwCatalog Build(
        string sourceFolder,
        string memoryName,
        string destinationName,
        Gazetteer gazetteer,
        string outputFolder,
        TextWriter? log = null,
        Action<int, int>? onProgress = null)
    {
        log ??= Console.Out;

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
            read.Add((file, kind, ReadMetadata(file, videoReader, log)));
            onProgress?.Invoke(++stepsDone, totalSteps);
        }

        var ordered = read
            .Select(entry => (
                entry.File,
                entry.Kind,
                entry.Metadata,
                EffectiveCapturedAt: entry.Metadata.CapturedAt ?? new DateTimeOffset(File.GetLastWriteTimeUtc(entry.File.FullPath))))
            .OrderBy(entry => entry.EffectiveCapturedAt)
            .ToList();

        var memoryId = Slug.From(memoryName);
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

    private static MediaMetadata ReadMetadata(MediaFile file, VideoMetadataReader videoReader, TextWriter log)
    {
        var metadata = file.IsVideo ? videoReader.Read(file.FullPath) : PhotoMetadataReader.Read(file.FullPath);
        if (metadata.CapturedAt is null)
        {
            log.WriteLine(
                $"Geen opnametijd voor {file.RelativePath} — valt terug op de bestandsdatum. " +
                "Tijdelijk: #33 vervangt dit door echte anomaliedetectie.");
        }

        return metadata;
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
}
