using System.IO;

namespace Indexer.Media;

// Which formats v1 actually reads, per docs/research/library-survey.md:
// JPEG/HEIC cover 96%+99% of photos and decode through WIC; MP4/MOV cover
// 93% of video with a readable capture time through the Shell. Everything
// else (.mts/.mpg camcorder footage, screenshots, junk) is out of scope for
// v1 and is skipped rather than guessed at.
public static class SourceFolderReader
{
    private static readonly string[] PhotoExtensions = [".jpg", ".jpeg", ".heic"];
    private static readonly string[] VideoExtensions = [".mp4", ".mov"];

    public static IReadOnlyList<MediaFile> Read(string sourceFolder, TextWriter? log = null)
    {
        log ??= Console.Out;
        var root = Path.GetFullPath(sourceFolder);
        var result = new List<MediaFile>();

        foreach (var fullPath in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
        {
            if (fullPath.Contains("@eaDir", StringComparison.OrdinalIgnoreCase)) continue;

            var extension = Path.GetExtension(fullPath).ToLowerInvariant();
            var isPhoto = PhotoExtensions.Contains(extension);
            var isVideo = VideoExtensions.Contains(extension);

            if (!isPhoto && !isVideo)
            {
                log.WriteLine($"Overgeslagen (niet ondersteund in v1): {Path.GetRelativePath(root, fullPath)}");
                continue;
            }

            var relativePath = Path.GetRelativePath(root, fullPath).Replace('\\', '/');
            result.Add(new MediaFile(fullPath, relativePath, isVideo));
        }

        return result;
    }
}
