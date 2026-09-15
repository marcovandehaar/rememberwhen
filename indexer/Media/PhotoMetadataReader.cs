using System.Globalization;
using System.Windows.Media.Imaging;

namespace Indexer.Media;

// WIC (System.Windows.Media.Imaging) reads HEIC and JPEG EXIF in one pass and
// needs no ImageMagick/ffmpeg — proven in docs/research/library-survey.md.
public static class PhotoMetadataReader
{
    public static MediaMetadata Read(string path)
    {
        // OnLoad forces WIC to read everything into memory up front and
        // release the file handle immediately — DelayCreation/None instead
        // keeps the file open for the decoder's lifetime, which leaks handles
        // since nothing here ever disposes it.
        var decoder = BitmapDecoder.Create(
            new Uri(path),
            BitmapCreateOptions.None,
            BitmapCacheOption.OnLoad);
        var frame = decoder.Frames[0];

        DateTimeOffset? capturedAt = null;
        Coordinate? gps = null;
        string? camera = null;
        if (frame.Metadata is BitmapMetadata metadata)
        {
            if (metadata.DateTaken is { } raw &&
                (DateTime.TryParse(raw, CultureInfo.CurrentCulture, DateTimeStyles.None, out var dt) ||
                 DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt)))
            {
                capturedAt = new DateTimeOffset(dt, TimeZoneInfo.Local.GetUtcOffset(dt));
            }

            gps = ReadGps(metadata);
            camera = ReadCamera(metadata);
        }

        return new MediaMetadata(frame.PixelWidth, frame.PixelHeight, capturedAt, Duration: null, gps, camera);
    }

    // Manufacturer and model are separate EXIF tags; combined into one
    // stable per-camera string, since that's all the anomaly detector needs
    // as a grouping key. Either can be absent (skipped rather than leaving
    // a stray blank).
    private static string? ReadCamera(BitmapMetadata metadata)
    {
        var parts = new[] { metadata.CameraManufacturer, metadata.CameraModel }
            .Where(part => !string.IsNullOrWhiteSpace(part));
        var combined = string.Join(" ", parts).Trim();
        return combined.Length == 0 ? null : combined;
    }

    // Only WIC exposes GPS on this machine — the Shell property set used for
    // video has no latitude/longitude among its properties (research/library-
    // survey.md). Stored as three unsigned rationals (degrees, minutes,
    // seconds) per tag, packed by WIC into a ulong per rational (numerator in
    // the high 32 bits, denominator in the low 32 bits).
    private static Coordinate? ReadGps(BitmapMetadata metadata)
    {
        var lat = ReadDegrees(metadata, "/app1/ifd/gps/{ushort=2}");
        var lon = ReadDegrees(metadata, "/app1/ifd/gps/{ushort=4}");
        if (lat is null || lon is null) return null;

        var latRef = metadata.GetQuery("/app1/ifd/gps/{ushort=1}") as string;
        var lonRef = metadata.GetQuery("/app1/ifd/gps/{ushort=3}") as string;
        var signedLat = string.Equals(latRef, "S", StringComparison.OrdinalIgnoreCase) ? -lat.Value : lat.Value;
        var signedLon = string.Equals(lonRef, "W", StringComparison.OrdinalIgnoreCase) ? -lon.Value : lon.Value;
        return new Coordinate(signedLat, signedLon);
    }

    private static double? ReadDegrees(BitmapMetadata metadata, string query)
    {
        if (metadata.GetQuery(query) is not ulong[] { Length: 3 } triplet) return null;

        double Part(ulong packed)
        {
            var numerator = (uint)(packed >> 32);
            var denominator = (uint)(packed & 0xFFFFFFFF);
            return denominator == 0 ? 0 : (double)numerator / denominator;
        }

        return Part(triplet[0]) + Part(triplet[1]) / 60.0 + Part(triplet[2]) / 3600.0;
    }
}
