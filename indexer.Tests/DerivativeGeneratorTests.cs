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
}
