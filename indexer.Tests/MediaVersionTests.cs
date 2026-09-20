using Indexer.Web;

namespace Indexer.Tests;

public class MediaVersionTests
{
    [Fact]
    public void Get_defaults_to_zero_for_a_path_never_touched()
    {
        Assert.Equal(0, MediaVersion.Get($"media/never-touched-{Guid.NewGuid():n}.jpg"));
    }

    [Fact]
    public void Touch_changes_what_Get_returns_for_that_path()
    {
        var path = $"media/{Guid.NewGuid():n}.jpg";
        var before = MediaVersion.Get(path);

        MediaVersion.Touch(path);

        Assert.NotEqual(before, MediaVersion.Get(path));
    }

    [Fact]
    public void Touch_does_not_affect_a_different_paths_version()
    {
        var touched = $"media/{Guid.NewGuid():n}.jpg";
        var untouched = $"media/{Guid.NewGuid():n}.jpg";

        MediaVersion.Touch(touched);

        Assert.Equal(0, MediaVersion.Get(untouched));
    }
}
