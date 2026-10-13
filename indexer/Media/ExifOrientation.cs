using System.IO;
using System.Windows.Media.Imaging;

namespace Indexer.Media;

// WIC decodes raw sensor pixels only — it exposes the EXIF Orientation tag
// (0x0112) as metadata but never applies it, unlike Explorer. One reader of
// that tag, so the pixels (DerivativeGenerator) and the dimensions reported
// for them (PhotoMetadataReader, which feeds the StoryRect) cannot disagree
// about which way is up (#67).
public static class ExifOrientation
{
    public const ushort Upright = 1;

    public static ushort Read(BitmapFrame frame)
    {
        if (frame.Metadata is not BitmapMetadata metadata) return Upright;

        try
        {
            return metadata.GetQuery("System.Photo.Orientation") is ushort o ? o : Upright;
        }
        catch (NotSupportedException)
        {
            return Upright; // format carries no EXIF (e.g. PNG)
        }
    }

    public static ushort Read(string path) =>
        Read(BitmapDecoder.Create(new Uri(path), BitmapCreateOptions.IgnoreImageCache, BitmapCacheOption.OnLoad).Frames[0]);

    // 90° and 270°, the only turns DerivativeGenerator applies besides 180°
    // (mirrored variants come from no camera here): they swap width and height.
    public static bool SwapsAxes(ushort orientation) => orientation is 6 or 8;
}
