using Indexer.Media;

namespace Indexer.Tests;

public class SourceFolderReaderTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

    public void Dispose() => Directory.Delete(_root, recursive: true);

    private string Folder(params string[] parts)
    {
        var path = Path.Combine([_root, .. parts]);
        Directory.CreateDirectory(path);
        return path;
    }

    private static void Touch(string folder, string name) => File.WriteAllBytes(Path.Combine(folder, name), []);

    [Fact]
    public void One_folder_reads_exactly_like_before()
    {
        var folder = Folder("a");
        Touch(folder, "x.jpg");

        var files = SourceFolderReader.ReadAll([folder], TextWriter.Null);

        Assert.Equal("x.jpg", Assert.Single(files).RelativePath);
    }

    [Fact]
    public void Several_folders_pool_into_one_list()
    {
        var a = Folder("a");
        var b = Folder("b");
        Touch(a, "one.jpg");
        Touch(b, "two.jpg");

        var files = SourceFolderReader.ReadAll([a, b], TextWriter.Null);

        Assert.Equal(2, files.Count);
    }

    [Fact]
    public void Files_with_the_same_name_in_different_folders_both_stay_and_stay_distinguishable()
    {
        var a = Folder("a");
        var b = Folder("b");
        Touch(a, "IMG_0001.jpg");
        Touch(b, "IMG_0001.jpg");

        var files = SourceFolderReader.ReadAll([a, b], TextWriter.Null);

        Assert.Equal(2, files.Count);
        Assert.Equal(2, files.Select(f => f.RelativePath).Distinct().Count());
    }

    [Fact]
    public void A_folder_nested_in_another_does_not_count_its_files_twice()
    {
        var parent = Folder("trip");
        var child = Folder("trip", "day2");
        Touch(parent, "top.jpg");
        Touch(child, "nested.jpg");

        var files = SourceFolderReader.ReadAll([parent, child], TextWriter.Null);

        Assert.Equal(2, files.Count);
        Assert.Single(files, f => f.FullPath.EndsWith("nested.jpg"));
    }

    [Fact]
    public void The_order_of_the_folders_does_not_change_which_files_are_found()
    {
        var parent = Folder("trip");
        var child = Folder("trip", "day2");
        Touch(child, "nested.jpg");

        var childFirst = SourceFolderReader.ReadAll([child, parent], TextWriter.Null);

        Assert.Single(childFirst);
    }
}
