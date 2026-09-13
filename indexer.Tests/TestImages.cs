using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Indexer.Tests;

// Synthetic fixtures: small JPEGs with EXIF capture times, standing in for
// real photos so tests never touch the family library on the NAS.
public static class TestImages
{
    public static void WriteJpeg(string path, int width, int height, DateTime? capturedAt = null)
    {
        var pixels = new byte[width * height * 3];
        var bitmap = BitmapSource.Create(width, height, 96, 96, PixelFormats.Rgb24, null, pixels, width * 3);

        var metadata = new BitmapMetadata("jpg");
        if (capturedAt is { } dt)
        {
            metadata.SetQuery("/app1/ifd/exif/{ushort=36867}", dt.ToString("yyyy:MM:dd HH:mm:ss"));
        }

        var frame = BitmapFrame.Create(bitmap, null, metadata, null);
        var encoder = new JpegBitmapEncoder();
        encoder.Frames.Add(frame);

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var stream = File.Create(path);
        encoder.Save(stream);
    }
}
