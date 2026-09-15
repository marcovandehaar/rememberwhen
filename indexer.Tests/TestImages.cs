using System.Windows.Media;
using System.Windows.Media.Imaging;
using Indexer;

namespace Indexer.Tests;

// Synthetic fixtures: small JPEGs with EXIF capture times (and, optionally,
// GPS) standing in for real photos so tests never touch the family library
// on the NAS.
public static class TestImages
{
    public static void WriteJpeg(
        string path, int width, int height, DateTime? capturedAt = null, Coordinate? gps = null, string? camera = null)
    {
        var pixels = new byte[width * height * 3];
        var bitmap = BitmapSource.Create(width, height, 96, 96, PixelFormats.Rgb24, null, pixels, width * 3);

        var metadata = new BitmapMetadata("jpg");
        if (capturedAt is { } dt)
        {
            metadata.SetQuery("/app1/ifd/exif/{ushort=36867}", dt.ToString("yyyy:MM:dd HH:mm:ss"));
        }

        if (camera is { } model)
        {
            metadata.SetQuery("/app1/ifd/{ushort=272}", model);
        }

        if (gps is { } coordinate)
        {
            WriteGpsRational(metadata, "/app1/ifd/gps/{ushort=2}", coordinate.Lat);
            metadata.SetQuery("/app1/ifd/gps/{ushort=1}", coordinate.Lat >= 0 ? "N" : "S");
            WriteGpsRational(metadata, "/app1/ifd/gps/{ushort=4}", coordinate.Lon);
            metadata.SetQuery("/app1/ifd/gps/{ushort=3}", coordinate.Lon >= 0 ? "E" : "W");
        }

        var frame = BitmapFrame.Create(bitmap, null, metadata, null);
        var encoder = new JpegBitmapEncoder();
        encoder.Frames.Add(frame);

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var stream = File.Create(path);
        encoder.Save(stream);
    }

    // EXIF GPS coordinates are three unsigned rationals (degrees, minutes,
    // seconds); WIC represents each rational as a ulong with the numerator
    // packed into the high 32 bits and the denominator into the low 32 bits.
    private static void WriteGpsRational(BitmapMetadata metadata, string query, double decimalDegrees)
    {
        var absolute = Math.Abs(decimalDegrees);
        var degrees = (uint)absolute;
        var minutesFull = (absolute - degrees) * 60;
        var minutes = (uint)minutesFull;
        var secondsNumerator = (uint)Math.Round((minutesFull - minutes) * 60 * 1000);

        static ulong Pack(uint numerator, uint denominator) => ((ulong)numerator << 32) | denominator;
        metadata.SetQuery(query, new[] { Pack(degrees, 1), Pack(minutes, 1), Pack(secondsNumerator, 1000) });
    }
}
