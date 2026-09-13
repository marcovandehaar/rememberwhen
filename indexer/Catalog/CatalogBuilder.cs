using System.IO;
using Indexer.Media;

namespace Indexer.Catalog;

// Ticket #28's scope only: one Source Folder, one Memory, one hardcoded
// Chapter. Chapter-splitting (#20/#31), anomaly detection (#19/#33) and the
// confirmation UI (#22/#34) are later tickets — a missing capture time here
// falls back to the file's own timestamp rather than being reported, which
// is a stopgap this ticket is explicitly allowed to leave behind.
public static class CatalogBuilder
{
    private const double DefaultShotDuration = 4.0;

    public static RwCatalog Build(
        string sourceFolder,
        string memoryName,
        string destinationName,
        Gazetteer gazetteer,
        string outputFolder,
        TextWriter? log = null)
    {
        log ??= Console.Out;

        var files = SourceFolderReader.Read(sourceFolder, log);
        if (files.Count == 0)
            throw new InvalidOperationException($"Geen ondersteunde media gevonden in {sourceFolder}.");

        using var videoReader = new VideoMetadataReader();

        var ordered = files
            .Select(file => (File: file, Kind: file.IsVideo ? MediaKind.Video : MediaKind.Photo, Metadata: ReadMetadata(file, videoReader, log)))
            .OrderBy(entry => entry.Metadata.CapturedAt ?? new DateTimeOffset(File.GetLastWriteTimeUtc(entry.File.FullPath)))
            .ToList();

        var memoryId = Slug.From(memoryName);
        var chapterId = $"{memoryId}-c1";
        var mediaDir = Path.Combine(outputFolder, "media");
        Directory.CreateDirectory(mediaDir);

        var mediaItems = new List<RwMediaItem>();
        string? coverImage = null;

        for (var i = 0; i < ordered.Count; i++)
        {
            var (file, kind, metadata) = ordered[i];
            var id = $"{chapterId}-{i:D4}-{Slug.From(Path.GetFileNameWithoutExtension(file.RelativePath))}";

            var (mediaRef, shotDuration) = kind == MediaKind.Video
                ? PublishVideo(file, metadata, id, mediaDir)
                : PublishPhoto(file, metadata, id, mediaDir);

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

            mediaItems.Add(new RwMediaItem
            {
                Id = id,
                MediaRef = mediaRef,
                Type = kind,
                CapturedAt = metadata.CapturedAt,
                StoryRect = StoryRectFormula.Compute(metadata.Width, metadata.Height, i),
                ShotDuration = shotDuration,
            });
        }

        var chapter = new RwChapter { Id = chapterId, MediaItems = mediaItems };
        var memory = new RwMemory
        {
            Id = memoryId,
            Name = memoryName,
            DestinationName = destinationName,
            DestinationCoordinate = gazetteer.Lookup(destinationName),
            CoverImage = coverImage!,
            Chapters = [chapter],
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
