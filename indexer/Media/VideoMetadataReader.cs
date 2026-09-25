using System.Globalization;
using System.Runtime.InteropServices;

namespace Indexer.Media;

// The Shell property set, not WIC: WIC doesn't read video, and this machine's
// Shell exposes no GPS fields for photos, which is why photos go through WIC
// instead. Property indices (Media created=215, Duration=43, Frame width/
// height=331/329) are specific to this machine's installed property handlers
// — proven in docs/research/library-survey.md — not a portable Windows API.
//
// One Shell.Application and one cached Namespace per directory, exactly like
// the proven spike (spike/library-scan.ps1): COM object creation is not
// free, and a fresh Shell.Application per file was measured nowhere. Dispose
// releases every RCW this instance handed out, not just the outermost one.
//
// "Media created" (215) is Shell's read of the mvhd atom's own creation_time
// — a legacy QuickTime field with no explicit UTC offset, found wrong by
// over half an hour against neighbouring photos on a real trip (#48
// follow-up). QuickTimeMetadataReader's "com.apple.quicktime.creationdate"
// is a second, independently-written timestamp iPhone .MOV files carry
// specifically to correct for that, so it's preferred when present; a video
// without it (camcorder footage, or .mp4 recorded in "Most Compatible" mode)
// still falls back to Shell's value, same as before.
public sealed class VideoMetadataReader : IDisposable
{
    private const int MediaCreatedIndex = 215;
    private const int DurationIndex = 43;
    private const int FrameWidthIndex = 331;
    private const int FrameHeightIndex = 329;

    private readonly dynamic _shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!)!;
    private readonly Dictionary<string, object> _namespaceCache = new();

    public MediaMetadata Read(string path)
    {
        var directory = Path.GetDirectoryName(path)!;
        var fileName = Path.GetFileName(path);
        var folder = GetNamespace(directory);
        object item = folder.ParseName(fileName);

        try
        {
            DateTimeOffset? capturedAt = QuickTimeMetadataReader.ReadCreationDate(path)
                ?? ParseDate(folder.GetDetailsOf(item, MediaCreatedIndex));
            var duration = ParseDuration(folder.GetDetailsOf(item, DurationIndex));
            var width = ParseDimension(folder.GetDetailsOf(item, FrameWidthIndex));
            var height = ParseDimension(folder.GetDetailsOf(item, FrameHeightIndex));

            return new MediaMetadata(width, height, capturedAt, duration);
        }
        finally
        {
            Marshal.ReleaseComObject(item);
        }
    }

    private dynamic GetNamespace(string directory)
    {
        if (!_namespaceCache.TryGetValue(directory, out var ns))
        {
            ns = _shell.Namespace(directory);
            _namespaceCache[directory] = ns;
        }

        return ns;
    }

    public void Dispose()
    {
        foreach (var ns in _namespaceCache.Values) Marshal.ReleaseComObject(ns);
        _namespaceCache.Clear();
        Marshal.ReleaseComObject(_shell);
    }

    private static DateTimeOffset? ParseDate(string? raw)
    {
        var cleaned = CleanNonPrintable(raw);
        if (string.IsNullOrWhiteSpace(cleaned)) return null;
        if (!DateTime.TryParse(cleaned, CultureInfo.CurrentCulture, DateTimeStyles.None, out var dt)) return null;
        return new DateTimeOffset(dt, TimeZoneInfo.Local.GetUtcOffset(dt));
    }

    private static TimeSpan? ParseDuration(string? raw)
    {
        var cleaned = CleanNonPrintable(raw);
        return TimeSpan.TryParse(cleaned, CultureInfo.InvariantCulture, out var ts) ? ts : null;
    }

    private static int ParseDimension(string? raw)
    {
        var digits = new string((CleanNonPrintable(raw) ?? "").Where(char.IsDigit).ToArray());
        return int.TryParse(digits, out var value) ? value : 0;
    }

    // GetDetailsOf pads values with directionality control characters.
    private static string? CleanNonPrintable(string? raw) =>
        raw is null ? null : new string(raw.Where(c => c is >= (char)0x20 and <= (char)0x7E).ToArray()).Trim();
}
