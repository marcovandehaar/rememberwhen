using Indexer.Web;

namespace Indexer.Tests;

public class FileSystemBrowserTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

    public FileSystemBrowserTests()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Schotland 2010"));
        Directory.CreateDirectory(Path.Combine(_root, "Zeeland 2016"));
        File.WriteAllText(Path.Combine(_root, "not-a-folder.txt"), "");
    }

    public void Dispose() => Directory.Delete(_root, recursive: true);

    [Fact]
    public void Browsing_with_no_path_and_no_configured_root_lists_the_available_drives()
    {
        var result = FileSystemBrowser.Browse(null, root: null);

        Assert.Null(result.Path);
        Assert.Null(result.Parent);
        Assert.NotEmpty(result.Folders);
    }

    [Fact]
    public void Browsing_a_folder_lists_only_its_subfolders_sorted_by_name()
    {
        var result = FileSystemBrowser.Browse(_root, root: null);

        Assert.Equal(Path.GetFullPath(_root), result.Path);
        Assert.Equal(["Schotland 2010", "Zeeland 2016"], result.Folders.Select(f => f.Name));
    }

    [Fact]
    public void Browsing_a_folder_reports_its_parent_for_navigating_up()
    {
        var child = Path.Combine(_root, "Schotland 2010");

        var result = FileSystemBrowser.Browse(child, root: null);

        Assert.Equal(Path.GetFullPath(_root), result.Parent);
    }

    [Fact]
    public void Browsing_a_missing_path_throws_a_clear_error()
    {
        var ex = Assert.Throws<DirectoryNotFoundException>(() => FileSystemBrowser.Browse(Path.Combine(_root, "Does Not Exist"), root: null));
        Assert.Contains("Does Not Exist", ex.Message);
    }

    [Fact]
    public void With_a_configured_root_no_path_starts_at_the_root_instead_of_the_drive_list()
    {
        var result = FileSystemBrowser.Browse(null, root: _root);

        Assert.Equal(Path.GetFullPath(_root), result.Path);
        Assert.Equal(["Schotland 2010", "Zeeland 2016"], result.Folders.Select(f => f.Name));
    }

    [Fact]
    public void With_a_configured_root_the_root_itself_reports_no_parent()
    {
        var result = FileSystemBrowser.Browse(_root, root: _root);

        Assert.Null(result.Parent);
    }

    [Fact]
    public void With_a_configured_root_a_subfolder_still_reports_its_real_parent()
    {
        var child = Path.Combine(_root, "Schotland 2010");

        var result = FileSystemBrowser.Browse(child, root: _root);

        Assert.Equal(Path.GetFullPath(_root), result.Parent);
    }

    [Fact]
    public void An_unreachable_configured_root_throws_a_clear_error_rather_than_falling_back_to_drives()
    {
        var missingRoot = Path.Combine(_root, "Does Not Exist");

        var ex = Assert.Throws<DirectoryNotFoundException>(() => FileSystemBrowser.Browse(null, root: missingRoot));
        Assert.Contains("Does Not Exist", ex.Message);
    }
}
