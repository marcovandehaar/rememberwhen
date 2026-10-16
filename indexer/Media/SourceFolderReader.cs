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

    // A Memory may draw on several Source Folders (#64): their files pool into
    // one list. A file reached twice (one folder nested in another) counts
    // once, by full path. With several folders two files can share a name, so
    // each path is prefixed with its folder's name — and a second folder with
    // the same name gets a numbered one — to keep every RelativePath unique.
    // One folder reads exactly as Read does.
    public static IReadOnlyList<MediaFile> ReadAll(IReadOnlyList<string> sourceFolders, TextWriter? log = null)
    {
        if (sourceFolders.Count == 1) return Read(sourceFolders[0], log);

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var labels = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<MediaFile>();

        foreach (var folder in sourceFolders)
        {
            var baseLabel = Path.GetFileName(Path.GetFullPath(folder).TrimEnd('\\', '/'));
            var label = baseLabel;
            for (var n = 2; !labels.Add(label); n++) label = $"{baseLabel} ({n})";

            foreach (var file in Read(folder, log))
            {
                if (seen.Add(Path.GetFullPath(file.FullPath)))
                    result.Add(file with { RelativePath = $"{label}/{file.RelativePath}" });
            }
        }

        return result;
    }
}
