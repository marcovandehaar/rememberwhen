using Indexer.Media;

namespace Indexer.Tests;

public class PhotoMetadataReaderTests
{
    [Fact]
    public void Reads_dimensions_and_capture_time_written_by_a_real_encoder()
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.jpg");
        var capturedAt = new DateTime(2024, 6, 1, 10, 30, 0);
        TestImages.WriteJpeg(path, width: 400, height: 300, capturedAt);

        try
        {
            var metadata = PhotoMetadataReader.Read(path);

            Assert.Equal(400, metadata.Width);
            Assert.Equal(300, metadata.Height);
            Assert.NotNull(metadata.CapturedAt);
            Assert.Equal(capturedAt, metadata.CapturedAt!.Value.DateTime);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void Reports_no_capture_time_when_the_file_carries_none()
    {
        var path = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.jpg");
        TestImages.WriteJpeg(path, width: 100, height: 100, capturedAt: null);

        try
        {
            var metadata = PhotoMetadataReader.Read(path);

            Assert.Null(metadata.CapturedAt);
        }
        finally
        {
            File.Delete(path);
        }
    }
}
