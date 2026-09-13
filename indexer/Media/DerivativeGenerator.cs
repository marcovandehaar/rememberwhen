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
    public const int Quality = 82;

    private static readonly string[] AlreadyJpeg = [".jpg", ".jpeg"];

    // Skip-rule: a source already at or below the target width, and already
    // JPEG, is served as-is rather than re-encoded.
    public static void GenerateStoryDerivative(string sourcePath, int sourceWidth, string outputPath)
    {
        var extension = Path.GetExtension(sourcePath).ToLowerInvariant();
        if (sourceWidth <= StoryWidth && AlreadyJpeg.Contains(extension))
        {
            File.Copy(sourcePath, outputPath, overwrite: true);
            return;
        }

        EncodeResizedJpeg(sourcePath, StoryWidth, outputPath);
    }

    public static void GeneratePinThumbnail(string sourcePath, string outputPath) =>
        EncodeResizedJpeg(sourcePath, PinThumbnailWidth, outputPath);

    private static void EncodeResizedJpeg(string sourcePath, int targetWidth, string outputPath)
    {
        var decoder = BitmapDecoder.Create(new Uri(sourcePath), BitmapCreateOptions.None, BitmapCacheOption.OnLoad);
        var frame = decoder.Frames[0];

        var width = Math.Min(targetWidth, frame.PixelWidth); // never upscale
        var scale = (double)width / frame.PixelWidth;
        var resized = new TransformedBitmap(frame, new System.Windows.Media.ScaleTransform(scale, scale));

        var encoder = new JpegBitmapEncoder { QualityLevel = Quality };
        encoder.Frames.Add(BitmapFrame.Create(resized));

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);
        using var stream = File.Create(outputPath);
        encoder.Save(stream);
    }
}
