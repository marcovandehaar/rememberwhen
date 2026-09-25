using Indexer.Media;

namespace Indexer.Tests;

public class HdrTranscoderTests
{
    [Fact]
    public void Maps_only_the_first_video_and_audio_stream()
    {
        var args = HdrTranscoder.BuildArguments("in.mov", "out.mp4");

        Assert.Contains("0:v:0", args);
        Assert.Contains("0:a:0?", args);
    }

    [Fact]
    public void Copies_audio_instead_of_re_encoding_it()
    {
        var args = HdrTranscoder.BuildArguments("in.mov", "out.mp4");

        var audioCodecFlagIndex = args.ToList().IndexOf("-c:a");
        Assert.Equal("copy", args[audioCodecFlagIndex + 1]);
    }

    [Fact]
    public void Passes_the_source_and_output_paths_through_unchanged()
    {
        var args = HdrTranscoder.BuildArguments("in.mov", "out.mp4");

        Assert.Contains("in.mov", args);
        Assert.Equal("out.mp4", args[^1]);
    }
}
