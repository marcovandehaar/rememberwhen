using Indexer.Media;

namespace Indexer.Tests;

public class QuickTimeMetadataReaderTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
    private readonly string _path;

    public QuickTimeMetadataReaderTests()
    {
        Directory.CreateDirectory(_dir);
        _path = Path.Combine(_dir, "video.mov");
    }

    public void Dispose() => Directory.Delete(_dir, recursive: true);

    [Fact]
    public void Reads_the_creation_date_with_its_explicit_utc_offset()
    {
        TestVideos.WriteMinimalVideo(_path, quickTimeCreationDate: "2026-07-10T11:06:05+0200");

        var result = QuickTimeMetadataReader.ReadCreationDate(_path);

        Assert.Equal(new DateTimeOffset(2026, 7, 10, 11, 6, 5, TimeSpan.FromHours(2)), result);
    }

    [Fact]
    public void Returns_null_when_the_file_has_no_quicktime_metadata_at_all()
    {
        TestVideos.WriteMinimalVideo(_path);

        Assert.Null(QuickTimeMetadataReader.ReadCreationDate(_path));
    }

    [Fact]
    public void Returns_null_instead_of_throwing_on_an_unparseable_file()
    {
        File.WriteAllBytes(_path, [1, 2, 3]);

        Assert.Null(QuickTimeMetadataReader.ReadCreationDate(_path));
    }

    [Fact]
    public async Task Returns_null_instead_of_hanging_on_a_box_whose_size_is_smaller_than_its_own_header()
    {
        // size=4, type="moov" — 4 is smaller than the 8 bytes already read
        // to learn that. A naive walker would seek backwards and re-read
        // the same bytes forever instead of recognizing this as malformed.
        File.WriteAllBytes(_path, [0, 0, 0, 4, (byte)'m', (byte)'o', (byte)'o', (byte)'v']);

        var task = Task.Run(() => QuickTimeMetadataReader.ReadCreationDate(_path));
        var completed = await Task.WhenAny(task, Task.Delay(TimeSpan.FromSeconds(2)));

        Assert.Same(task, completed);
        Assert.Null(await task);
    }
}
