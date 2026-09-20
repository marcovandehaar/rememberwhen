using Indexer.Media;

namespace Indexer.Tests;

public class DerivativeGeneratorTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
    private readonly string _source;
    private readonly string _output;

    public DerivativeGeneratorTests()
    {
        Directory.CreateDirectory(_dir);
        _source = Path.Combine(_dir, "source.jpg");
        _output = Path.Combine(_dir, "output.jpg");
    }

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void Resizes_a_large_photo_down_to_the_story_width()
    {
        TestImages.WriteJpeg(_source, width: 4000, height: 3000);

        DerivativeGenerator.GenerateStoryDerivative(_source, sourceWidth: 4000, _output);

        var result = PhotoMetadataReader.Read(_output);
        Assert.Equal(DerivativeGenerator.StoryWidth, result.Width);
    }

    [Fact]
    public void Never_upscales_a_photo_smaller_than_the_story_width()
    {
        TestImages.WriteJpeg(_source, width: 800, height: 600);

        DerivativeGenerator.GenerateStoryDerivative(_source, sourceWidth: 800, _output);

        var result = PhotoMetadataReader.Read(_output);
        Assert.Equal(800, result.Width);
    }

    [Fact]
    public void Skip_rule_serves_a_small_jpeg_byte_for_byte()
    {
        TestImages.WriteJpeg(_source, width: 800, height: 600);

        DerivativeGenerator.GenerateStoryDerivative(_source, sourceWidth: 800, _output);

        Assert.Equal(File.ReadAllBytes(_source), File.ReadAllBytes(_output));
    }

    [Fact]
    public void Skip_rule_does_not_apply_to_a_small_non_jpeg_source()
    {
        // A small HEIC would otherwise qualify for the skip-rule on size
        // alone, but HEIC is not an allowed output format (Lockdown Mode) —
        // it must still be re-encoded to JPEG, just without upscaling.
        var heicNamedSource = Path.Combine(_dir, "source.heic");
        TestImages.WriteJpeg(heicNamedSource, width: 800, height: 600);

        DerivativeGenerator.GenerateStoryDerivative(heicNamedSource, sourceWidth: 800, _output);

        Assert.NotEqual(File.ReadAllBytes(heicNamedSource), File.ReadAllBytes(_output));
        var result = PhotoMetadataReader.Read(_output);
        Assert.Equal(800, result.Width);
    }

    [Fact]
    public void Pin_thumbnail_is_scaled_to_the_fixed_width()
    {
        TestImages.WriteJpeg(_source, width: 4000, height: 3000);

        DerivativeGenerator.GeneratePinThumbnail(_source, _output);

        var result = PhotoMetadataReader.Read(_output);
        Assert.Equal(DerivativeGenerator.PinThumbnailWidth, result.Width);
    }

    [Fact]
    public void RotatePhoto_swaps_width_and_height_for_a_90_degree_turn()
    {
        TestImages.WriteJpeg(_source, width: 400, height: 300);

        var (width, height) = DerivativeGenerator.RotatePhoto(_source, degrees: 90);

        Assert.Equal(300, width);
        Assert.Equal(400, height);
        var result = PhotoMetadataReader.Read(_source);
        Assert.Equal(300, result.Width);
    }

    [Fact]
    public void RotatePhoto_overwrites_the_same_file_it_reads()
    {
        TestImages.WriteJpeg(_source, width: 400, height: 300);
        var before = File.ReadAllBytes(_source);

        DerivativeGenerator.RotatePhoto(_source, degrees: 90);

        Assert.NotEqual(before, File.ReadAllBytes(_source));
    }

    [Fact]
    public void RotatePhoto_four_quarter_turns_returns_to_the_original_size()
    {
        TestImages.WriteJpeg(_source, width: 400, height: 300);

        (int width, int height) size = (0, 0);
        for (var i = 0; i < 4; i++) size = DerivativeGenerator.RotatePhoto(_source, degrees: 90);

        Assert.Equal((400, 300), size);
    }

    // Regression: WPF caches a decoded bitmap by its URI/path for the
    // process's lifetime. RotatePhoto reads and overwrites _source, so
    // regenerating a derivative from that same path afterwards — same
    // sequence the "rotate the current cover" endpoint runs — must not
    // silently pick up the pre-rotation decode still cached from the first
    // read. This reproduced without Decode()'s IgnoreImageCache.
    [Fact]
    public void GeneratePinThumbnail_reads_fresh_pixels_right_after_RotatePhoto_touched_the_same_path()
    {
        TestImages.WriteJpeg(_source, width: 400, height: 300);
        DerivativeGenerator.RotatePhoto(_source, degrees: 90); // now portrait, 300x400, on disk

        DerivativeGenerator.GeneratePinThumbnail(_source, _output);

        var result = PhotoMetadataReader.Read(_output);
        Assert.Equal(DerivativeGenerator.PinThumbnailWidth, result.Width);
        // A fixed-width-192 thumb of a 300x400 (portrait) source comes out
        // taller than wide; the stale pre-rotation 400x300 (landscape)
        // source would produce the opposite. Taller-than-wide proves this
        // read the rotated pixels, not a cached pre-rotation decode.
        Assert.True(result.Height > DerivativeGenerator.PinThumbnailWidth);
    }
}
