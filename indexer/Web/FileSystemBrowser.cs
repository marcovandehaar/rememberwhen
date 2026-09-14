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
    // No path (or the drive list's own "parent") means: show the drives.
    public static BrowseResult Browse(string? path)
    {
        if (string.IsNullOrEmpty(path)) return new BrowseResult(null, null, ListDrives());

        if (!Directory.Exists(path))
            throw new DirectoryNotFoundException($"Map bestaat niet: {path}");

        var full = Path.GetFullPath(path);
        var parent = Directory.GetParent(full)?.FullName;

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
