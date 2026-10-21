using System.Globalization;
using System.Runtime.InteropServices;

namespace Indexer.Media;

// The Shell property set, not WIC: WIC doesn't read video, and this machine's
// Shell exposes no GPS fields for photos, which is why photos go through WIC
// instead. The column numbers of the properties we read (Media created,
// Length, Frame width/height) are not stable: a Windows update moved every one
// by one place, which silently gave videos no capture time and wrong sizes. So
// the columns are found by their header name (ShellColumns), with the old
// numbers (docs/research/library-survey.md) only as the fallback.
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
    private readonly dynamic _shell = Activator.CreateInstance(Type.GetTypeFromProgID("Shell.Application")!)!;
    private readonly Dictionary<string, object> _namespaceCache = new();
    private ShellColumns? _columns;

    public MediaMetadata Read(string path)
    {
        var directory = Path.GetDirectoryName(path)!;
        var fileName = Path.GetFileName(path);
        var folder = GetNamespace(directory);
        var columns = _columns ??= ShellColumns.Resolve(i => (string?)folder.GetDetailsOf(null, i));
        object item = folder.ParseName(fileName);

        try
        {
            DateTimeOffset? capturedAt = QuickTimeMetadataReader.ReadCreationDate(path)
                ?? ParseDate(folder.GetDetailsOf(item, columns.MediaCreated));
            var duration = ParseDuration(folder.GetDetailsOf(item, columns.Duration));
            var width = ParseDimension(folder.GetDetailsOf(item, columns.FrameWidth));
            var height = ParseDimension(folder.GetDetailsOf(item, columns.FrameHeight));

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

// Where the Shell keeps each property we read, found by header name. Headers are
// in the display language, so a Dutch Windows lists none of the English names:
// that property then keeps its old column number rather than failing.
public sealed record ShellColumns(int MediaCreated, int Duration, int FrameWidth, int FrameHeight)
{
    public static readonly ShellColumns Legacy = new(215, 43, 331, 329);
    private const int ScanLimit = 400;

    public static ShellColumns Resolve(Func<int, string?> headerAt)
    {
        var headers = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < ScanLimit; i++)
        {
            var name = Clean(headerAt(i));
            if (name.Length > 0) headers.TryAdd(name, i);
        }

        int Find(int fallback, params string[] names) =>
            names.Select(n => headers.TryGetValue(n, out var i) ? i : -1).FirstOrDefault(i => i >= 0, fallback);

        return new ShellColumns(
            MediaCreated: Find(Legacy.MediaCreated, "Media created", "Media gemaakt"),
            // "Length" is the one that carries a video's running time; "Duration" is empty for MP4.
            Duration: Find(Legacy.Duration, "Length", "Lengte", "Duration"),
            FrameWidth: Find(Legacy.FrameWidth, "Frame width", "Framebreedte"),
            FrameHeight: Find(Legacy.FrameHeight, "Frame height", "Framehoogte"));
    }

    private static string Clean(string? raw) =>
        raw is null ? "" : new string(raw.Where(c => c is >= (char)0x20 and <= (char)0x7E).ToArray()).Trim();
}
