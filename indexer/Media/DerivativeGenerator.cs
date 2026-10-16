using System.IO;
using System.Linq;
using System.Windows.Media.Imaging;

namespace Indexer.Media;

// docs/v1-build-spec.md §1 — fixed sizes for the one known device (10.2"
// iPad, DPR 2), JPEG only. Never upscale.
public static class DerivativeGenerator
{
    public const int StoryWidth = 2160;
    public const int PinThumbnailWidth = 192; // 96 CSS px * DPR 2
    public const int CoverPhotoShortSide = 800; // a square polaroid crop, sharp on a Retina iPad
    public const int Quality = 82;

    private static readonly string[] AlreadyJpeg = [".jpg", ".jpeg"];

    // Skip-rule: a source already at or below the target width, already
    // JPEG and already upright, is served as-is rather than re-encoded. A
    // sideways one (EXIF orientation) is re-encoded so the pixels are upright
    // and no viewer has to honour the tag. `sourceWidth` is the upright width.
    public static void GenerateStoryDerivative(string sourcePath, int sourceWidth, string outputPath)
    {
        var extension = Path.GetExtension(sourcePath).ToLowerInvariant();
        if (sourceWidth <= StoryWidth && AlreadyJpeg.Contains(extension) && ExifOrientation.Read(sourcePath) == ExifOrientation.Upright)
        {
            File.Copy(sourcePath, outputPath, overwrite: true);
            return;
        }

        EncodeResizedJpeg(sourcePath, _ => StoryWidth, outputPath);
    }

    public static void GeneratePinThumbnail(string sourcePath, string outputPath) =>
        EncodeResizedJpeg(sourcePath, _ => PinThumbnailWidth, outputPath);

    // The timeline's polaroid cover (#74): the short side is CoverPhotoShortSide,
    // so a square crop of it stays sharp whichever way the photo is held. Never upscaled.
    public static void GenerateCoverPhoto(string sourcePath, string outputPath) =>
        EncodeResizedJpeg(sourcePath, frame =>
        {
            var shortSide = Math.Min(frame.PixelWidth, frame.PixelHeight);
            var scale = Math.Min(1.0, (double)CoverPhotoShortSide / shortSide);
            return (int)Math.Round(frame.PixelWidth * scale);
        }, outputPath);

    // Rotates a derivative in place — never the original source file, same
    // rule as everywhere else here. Returns the rotated pixel size, since
    // 90°/270° swap width and height and the caller needs that to recompute
    // framing (StoryRectFormula).
    public static (int Width, int Height) RotatePhoto(string path, int degrees)
    {
        var frame = Decode(path);
        var rotated = new TransformedBitmap(frame, new System.Windows.Media.RotateTransform(degrees));

        var encoder = new JpegBitmapEncoder { QualityLevel = Quality };
        encoder.Frames.Add(BitmapFrame.Create(rotated));

        using (var stream = File.Create(path))
        {
            encoder.Save(stream);
        }

        // Re-decode rather than trust `rotated`'s own PixelWidth/Height: this
        // reads the same path it just overwrote, which is exactly the case
        // Decode()'s IgnoreImageCache exists for — without it this silently
        // returned the pre-rotation size (confirmed in testing).
        var writtenFrame = Decode(path);
        return (writtenFrame.PixelWidth, writtenFrame.PixelHeight);
    }

    private static void EncodeResizedJpeg(string sourcePath, Func<BitmapSource, int> targetWidth, string outputPath)
    {
        var frame = Decode(sourcePath);

        var width = Math.Min(targetWidth(frame), frame.PixelWidth); // never upscale
        var scale = (double)width / frame.PixelWidth;
        var resized = new TransformedBitmap(frame, new System.Windows.Media.ScaleTransform(scale, scale));

        var encoder = new JpegBitmapEncoder { QualityLevel = Quality };
        encoder.Frames.Add(BitmapFrame.Create(resized));

        // Encoded in memory first: the pixels are only really decoded here, so
        // a bad source throws now, and must not leave behind (or overwrite a
        // good published copy with) a half-written file.
        using var buffer = new MemoryStream();
        encoder.Save(buffer);

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        File.WriteAllBytes(outputPath, buffer.ToArray());
    }

    // IgnoreImageCache: WPF's imaging pipeline otherwise caches a decoded
    // bitmap by its URI/path for the lifetime of the process. RotatePhoto
    // reads and overwrites the same path, so a later derivative regenerated
    // from it (a cover's pin thumbnail, say) would silently reuse whatever
    // was decoded the first time this path was ever touched — stale pixels,
    // not what's actually on disk now. Without this, that reproduced.
    private static BitmapSource Decode(string path)
    {
        var frame = BitmapDecoder.Create(new Uri(path), BitmapCreateOptions.IgnoreImageCache, BitmapCacheOption.OnLoad).Frames[0];
        return ApplyExifOrientation(frame);
    }

    // WIC decodes raw sensor pixels only — it exposes the EXIF Orientation
    // tag (0x0112) as metadata but never applies it, unlike Explorer. Found
    // via the Denmark 2023 import: phones commonly shoot a landscape sensor
    // buffer tagged orientation=6 ("display me rotated 90°"), so every
    // derivative came out sideways. Baking the rotation into the pixels once,
    // here, means every caller downstream (scale, manual RotatePhoto) starts
    // from pixels that are already upright, and the re-encoded output needs
    // no orientation tag of its own. Only the three pure-rotation values are
    // handled — the mirrored variants (2/4/5/7) don't come from any camera
    // this library has seen.
    private static BitmapSource ApplyExifOrientation(BitmapFrame frame)
    {
        System.Windows.Media.Transform? rotation = ExifOrientation.Read(frame) switch
        {
            3 => new System.Windows.Media.RotateTransform(180),
            6 => new System.Windows.Media.RotateTransform(90),
            8 => new System.Windows.Media.RotateTransform(270),
            _ => null,
        };

        return rotation is null ? frame : new TransformedBitmap(frame, rotation);
    }
}
