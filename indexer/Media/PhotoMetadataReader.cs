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
        if (frame.Metadata is BitmapMetadata metadata && metadata.DateTaken is { } raw)
        {
            if (DateTime.TryParse(raw, CultureInfo.CurrentCulture, DateTimeStyles.None, out var dt) ||
                DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt))
            {
                capturedAt = new DateTimeOffset(dt, TimeZoneInfo.Local.GetUtcOffset(dt));
            }
        }

        return new MediaMetadata(frame.PixelWidth, frame.PixelHeight, capturedAt, Duration: null);
    }
}
