using System.IO;

namespace Indexer.Web;

public sealed record BrowseEntry(string Name, string Path);

public sealed record BrowseResult(string? Path, string? Parent, List<BrowseEntry> Folders);

// Backs the in-page folder picker. A plain browser page can't get a native
// OS folder dialog to hand back a real filesystem path (browsers deliberately
// hide that), but the Indexer already runs locally on the operator's own
// machine — so it lists its own filesystem instead, and the page renders
// that as a Finder/Explorer-style browser.
public static class FileSystemBrowser
{
    // No path means "start over". With a configured root (e.g. a NAS share
    // all Source Folders live under), that's the root itself, not the drive
    // list — and navigating up stops there too, rather than escaping onto
    // drives the root has nothing to do with.
    public static BrowseResult Browse(string? path, string? root)
    {
        var effectivePath = string.IsNullOrEmpty(path) ? root : path;
        if (string.IsNullOrEmpty(effectivePath)) return new BrowseResult(null, null, ListDrives());

        if (!Directory.Exists(effectivePath))
            throw new DirectoryNotFoundException($"Map bestaat niet: {effectivePath}");

        var full = Path.GetFullPath(effectivePath);
        var isRoot = !string.IsNullOrEmpty(root) &&
                     string.Equals(full.TrimEnd('\\'), Path.GetFullPath(root).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase);
        var parent = isRoot ? null : Directory.GetParent(full)?.FullName;

        List<BrowseEntry> folders;
        try
        {
            folders = Directory.GetDirectories(full)
                .Select(d => new BrowseEntry(Path.GetFileName(d), d))
                .OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch (UnauthorizedAccessException)
        {
            folders = [];
        }

        return new BrowseResult(full, parent, folders);
    }

    private static List<BrowseEntry> ListDrives() =>
        DriveInfo.GetDrives()
            .Where(d => d.IsReady)
            .Select(d => new BrowseEntry(d.Name.TrimEnd('\\'), d.Name))
            .OrderBy(d => d.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
}
