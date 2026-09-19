using System.IO;
using System.Text.RegularExpressions;

namespace Indexer.Web;

// Small, testable pieces of the "Publiceren"-knop (#47): finding
// deploy-nas.ps1 from wherever the Indexer's own config.json lives, and
// reading the progress lines deploy-nas.ps1 prints while it runs. The
// process-launching itself stays in UiServer.cs, same split as NominatimClient.
public static class DeployRun
{
    private static readonly Regex ProgressLine = new(@"^PROGRESS (\d+) (\d+)$", RegexOptions.Compiled);

    // npm/vite colour their output with ANSI escapes regardless of whether
    // the process's stdout is a real terminal; left in, the log box shows
    // literal "[36m" noise instead of the message (#47 — a real run's
    // failure was hard to read on-screen because of this).
    private static readonly Regex AnsiEscape = new(@"\x1B\[[0-9;]*[a-zA-Z]", RegexOptions.Compiled);

    public static string StripAnsi(string line) => AnsiEscape.Replace(line, "");

    // config.json lives at <repoRoot>/indexer/config.json; deploy-nas.ps1 at
    // <repoRoot>/deploy-nas.ps1 — one level further up than every other
    // config-relative path in this file (those resolve *into* the Indexer's
    // own data, this one resolves *out* to the repo that contains it).
    public static string FindRepoRoot(string configPath) =>
        Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Path.GetFullPath(configPath))!, ".."));

    public static (int Done, int Total)? ParseProgressLine(string line)
    {
        var match = ProgressLine.Match(line);
        return match.Success
            ? (int.Parse(match.Groups[1].Value), int.Parse(match.Groups[2].Value))
            : null;
    }
}
