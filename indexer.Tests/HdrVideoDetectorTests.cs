using Indexer.Media;

namespace Indexer.Tests;

public class HdrVideoDetectorTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
    private readonly string _path;

    public HdrVideoDetectorTests()
    {
        Directory.CreateDirectory(_dir);
        _path = Path.Combine(_dir, "video.mp4");
    }

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void Detects_a_dolby_vision_configuration_box()
    {
        TestVideos.WriteMinimalVideo(_path, dolbyVisionConfigBox: true);

        Assert.True(HdrVideoDetector.IsHdr(_path));
    }

    [Fact]
    public void Detects_pq_transfer_function_in_the_colr_box()
    {
        TestVideos.WriteMinimalVideo(_path, colrTransferFunction: 16);

        Assert.True(HdrVideoDetector.IsHdr(_path));
    }

    [Fact]
    public void Detects_hlg_transfer_function_in_the_colr_box()
    {
        TestVideos.WriteMinimalVideo(_path, colrTransferFunction: 18);

        Assert.True(HdrVideoDetector.IsHdr(_path));
    }

    [Fact]
    public void Does_not_flag_an_ordinary_sdr_transfer_function()
    {
        TestVideos.WriteMinimalVideo(_path, colrTransferFunction: 1); // BT.709

        Assert.False(HdrVideoDetector.IsHdr(_path));
    }

    [Fact]
    public void Does_not_flag_a_video_with_no_color_signalling_at_all()
    {
        TestVideos.WriteMinimalVideo(_path);

        Assert.False(HdrVideoDetector.IsHdr(_path));
    }

    [Fact]
    public void Returns_false_instead_of_throwing_on_an_unparseable_file()
    {
        File.WriteAllBytes(_path, [1, 2, 3]);

        Assert.False(HdrVideoDetector.IsHdr(_path));
    }
}
