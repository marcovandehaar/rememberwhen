using Indexer.Media;

namespace Indexer.Tests;

public class ShellColumnsTests
{
    [Fact]
    public void Finds_each_property_by_its_header_wherever_the_shell_put_it()
    {
        var headers = new Dictionary<int, string>
        {
            [27] = "Length", [43] = "Duration", [214] = "Media created", [215] = "Date released",
            [328] = "Frame height", [329] = "Frame rate", [330] = "Frame width", [331] = "Spherical",
        };

        var columns = ShellColumns.Resolve(i => headers.GetValueOrDefault(i));

        Assert.Equal(new ShellColumns(MediaCreated: 214, Duration: 27, FrameWidth: 330, FrameHeight: 328), columns);
    }

    [Fact]
    public void Ignores_the_directionality_padding_the_shell_adds_to_headers()
    {
        var columns = ShellColumns.Resolve(i => i == 214 ? "‎Media created‏" : null);

        Assert.Equal(214, columns.MediaCreated);
    }

    [Fact]
    public void Keeps_the_old_column_for_a_header_it_does_not_recognise()
    {
        var columns = ShellColumns.Resolve(_ => null);

        Assert.Equal(ShellColumns.Legacy, columns);
    }
}
