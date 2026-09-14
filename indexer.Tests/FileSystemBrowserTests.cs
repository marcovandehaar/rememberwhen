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
    public void Browsing_with_no_path_lists_the_available_drives()
    {
        var result = FileSystemBrowser.Browse(null);

        Assert.Null(result.Path);
        Assert.Null(result.Parent);
        Assert.NotEmpty(result.Folders);
    }

    [Fact]
    public void Browsing_a_folder_lists_only_its_subfolders_sorted_by_name()
    {
        var result = FileSystemBrowser.Browse(_root);

        Assert.Equal(Path.GetFullPath(_root), result.Path);
        Assert.Equal(["Schotland 2010", "Zeeland 2016"], result.Folders.Select(f => f.Name));
    }

    [Fact]
    public void Browsing_a_folder_reports_its_parent_for_navigating_up()
    {
        var child = Path.Combine(_root, "Schotland 2010");

        var result = FileSystemBrowser.Browse(child);

        Assert.Equal(Path.GetFullPath(_root), result.Parent);
    }

    [Fact]
    public void Browsing_a_missing_path_throws_a_clear_error()
    {
        var ex = Assert.Throws<DirectoryNotFoundException>(() => FileSystemBrowser.Browse(Path.Combine(_root, "Does Not Exist")));
        Assert.Contains("Does Not Exist", ex.Message);
    }
}
