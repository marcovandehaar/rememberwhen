using Indexer.Web;

namespace Indexer.Tests;

public class DeployRunTests
{
    [Fact]
    public void FindRepoRoot_goes_one_level_above_configs_own_directory()
    {
        var configPath = Path.Combine(Path.GetTempPath(), "some-repo", "indexer", "config.json");

        var repoRoot = DeployRun.FindRepoRoot(configPath);

        Assert.Equal(Path.Combine(Path.GetTempPath(), "some-repo").TrimEnd(Path.DirectorySeparatorChar), repoRoot.TrimEnd(Path.DirectorySeparatorChar));
    }

    [Fact]
    public void ParseProgressLine_reads_a_well_formed_line()
    {
        var result = DeployRun.ParseProgressLine("PROGRESS 12 340");

        Assert.Equal((12, 340), result);
    }

    [Theory]
    [InlineData("== dist/ kopieren naar vandehaar@192.168.0.137:/volume1/web ==")]
    [InlineData("")]
    [InlineData("PROGRESS abc def")]
    [InlineData("progress 1 2")]
    public void ParseProgressLine_returns_null_for_anything_else(string line)
    {
        Assert.Null(DeployRun.ParseProgressLine(line));
    }

    [Fact]
    public void StripAnsi_removes_colour_codes_and_keeps_the_message()
    {
        var stripped = DeployRun.StripAnsi("[36mvite v8.3.0 [32mbuilding client environment for production...[39m");

        Assert.Equal("vite v8.3.0 building client environment for production...", stripped);
    }

    [Fact]
    public void StripAnsi_leaves_a_plain_line_untouched()
    {
        Assert.Equal("== Frontend bouwen ==", DeployRun.StripAnsi("== Frontend bouwen =="));
    }
}
