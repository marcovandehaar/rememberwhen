using Indexer.Curation;

namespace Indexer.Tests;

public class CurationEditsTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

    public CurationEditsTests() => Directory.CreateDirectory(_root);

    public void Dispose() => Directory.Delete(_root, recursive: true);

    [Fact]
    public void Removed_files_are_remembered_once_by_their_full_path()
    {
        var curation = CurationFile.CreateEmpty();

        curation.RemoveFile(@"\\nas\Fotos\a.jpg");
        curation.RemoveFile(@"\\nas\Fotos\a.jpg");

        Assert.Equal([@"\\nas\Fotos\a.jpg"], curation.RemovedFiles);
    }

    [Fact]
    public void A_rotation_adds_up_quarter_turns_and_a_full_turn_leaves_no_edit_behind()
    {
        var curation = CurationFile.CreateEmpty();

        curation.Rotate("a.jpg");
        Assert.Equal(90, curation.Rotations["a.jpg"]);

        curation.Rotate("a.jpg");
        curation.Rotate("a.jpg");
        Assert.Equal(270, curation.Rotations["a.jpg"]);

        curation.Rotate("a.jpg");
        Assert.False(curation.Rotations.ContainsKey("a.jpg"));
    }

    [Fact]
    public void Edits_to_files_that_are_gone_are_dropped_and_counted()
    {
        var curation = CurationFile.CreateEmpty();
        curation.RemoveFile("gone.jpg");
        curation.RemoveFile("here.jpg");
        curation.Rotate("gone.jpg");
        curation.Rotate("here.jpg");
        curation.SetCover("gone.jpg");

        var dropped = curation.DropMissing(path => path == "here.jpg");

        Assert.Equal(["here.jpg"], curation.RemovedFiles);
        Assert.Equal(["here.jpg"], curation.Rotations.Keys);
        Assert.Null(curation.CoverFile);
        Assert.Equal(3, dropped);
    }

    [Fact]
    public void The_edits_round_trip_through_the_file_and_an_older_file_without_them_still_loads()
    {
        var path = Path.Combine(_root, "m.curation.json");
        var curation = CurationFile.CreateEmpty();
        curation.RemoveFile("a.jpg");
        curation.SetCover("b.jpg");
        curation.Rotate("c.jpg");
        curation.Save(path);

        var loaded = CurationFile.Load(path);

        Assert.Equal(["a.jpg"], loaded.RemovedFiles);
        Assert.Equal("b.jpg", loaded.CoverFile);
        Assert.Equal(90, loaded.Rotations["c.jpg"]);

        File.WriteAllText(path, """{ "anomalies": {} }""");
        Assert.Empty(CurationFile.Load(path).RemovedFiles);
    }

    [Fact]
    public void The_item_map_leads_from_a_media_item_id_back_to_its_source_file()
    {
        var path = ItemMap.PathFor(_root, "zeeland");
        ItemMap.Save(path, new Dictionary<string, string> { ["zeeland-c1-0000-a"] = @"\\nas\a.jpg" });

        Assert.Equal(@"\\nas\a.jpg", ItemMap.Load(path)!["zeeland-c1-0000-a"]);
        Assert.Equal(Path.Combine(_root, "zeeland.items.json"), path);
    }

    [Fact]
    public void A_memory_without_an_item_map_has_none()
    {
        Assert.Null(ItemMap.Load(ItemMap.PathFor(_root, "nooit-gebouwd")));
    }

    [Fact]
    public void Recording_an_edit_needs_the_item_map_and_says_so_when_it_is_missing()
    {
        var recordedWithoutMap = ItemEdits.TryRecord(_root, "zeeland", "zeeland-c1-0000-a", (curation, source) => curation.RemoveFile(source));

        Assert.False(recordedWithoutMap);
        Assert.False(File.Exists(CurationFile.PathFor(_root, "zeeland")));
    }

    [Fact]
    public void Recording_an_edit_looks_the_source_file_up_and_stores_it_in_the_curation_file()
    {
        ItemMap.Save(ItemMap.PathFor(_root, "zeeland"), new Dictionary<string, string> { ["zeeland-c1-0000-a"] = @"\\nas\a.jpg" });

        var recorded = ItemEdits.TryRecord(_root, "zeeland", "zeeland-c1-0000-a", (curation, source) => curation.RemoveFile(source));

        Assert.True(recorded);
        Assert.Equal([@"\\nas\a.jpg"], CurationFile.Load(CurationFile.PathFor(_root, "zeeland")).RemovedFiles);
    }

    [Fact]
    public void Recording_an_edit_for_an_unknown_item_changes_nothing()
    {
        ItemMap.Save(ItemMap.PathFor(_root, "zeeland"), new Dictionary<string, string> { ["zeeland-c1-0000-a"] = "a.jpg" });

        Assert.False(ItemEdits.TryRecord(_root, "zeeland", "zeeland-c1-0099-x", (curation, source) => curation.RemoveFile(source)));
        Assert.False(File.Exists(CurationFile.PathFor(_root, "zeeland")));
    }

    [Fact]
    public void A_memory_that_gets_a_new_id_takes_its_curation_and_item_map_along()
    {
        var curation = CurationFile.CreateEmpty();
        curation.RemoveFile("a.jpg");
        curation.Save(CurationFile.PathFor(_root, "oud"));
        ItemMap.Save(ItemMap.PathFor(_root, "oud"), new Dictionary<string, string> { ["oud-c1-0000-a"] = "a.jpg" });

        CurationFile.Rekey(_root, "oud", "nieuw");

        Assert.Equal(["a.jpg"], CurationFile.Load(CurationFile.PathFor(_root, "nieuw")).RemovedFiles);
        Assert.False(File.Exists(CurationFile.PathFor(_root, "oud")));
        // the item map moves too, so a failed build under the new id leaves the Memory with its map
        Assert.Equal("a.jpg", ItemMap.Load(ItemMap.PathFor(_root, "nieuw"))!["oud-c1-0000-a"]);
        Assert.False(File.Exists(ItemMap.PathFor(_root, "oud")));
    }

    [Fact]
    public void Re_keying_never_overwrites_a_curation_file_the_new_id_already_has()
    {
        var old = CurationFile.CreateEmpty();
        old.RemoveFile("oud.jpg");
        old.Save(CurationFile.PathFor(_root, "oud"));
        var existing = CurationFile.CreateEmpty();
        existing.RemoveFile("nieuw.jpg");
        existing.Save(CurationFile.PathFor(_root, "nieuw"));

        CurationFile.Rekey(_root, "oud", "nieuw");

        Assert.Equal(["nieuw.jpg"], CurationFile.Load(CurationFile.PathFor(_root, "nieuw")).RemovedFiles);
    }

    [Fact]
    public void Paths_match_regardless_of_case_since_the_nas_does_not_care()
    {
        var path = Path.Combine(_root, "m.curation.json");
        var curation = CurationFile.CreateEmpty();
        curation.RemoveFile(@"\\NAS\Fotos\A.jpg");
        curation.Rotate(@"\\NAS\Fotos\B.jpg");
        curation.Save(path);

        var loaded = CurationFile.Load(path);

        Assert.Contains(@"\\nas\fotos\a.jpg", loaded.RemovedFiles);
        Assert.True(loaded.Rotations.ContainsKey(@"\\nas\fotos\b.jpg"));
    }

    [Fact]
    public void Saving_a_build_keeps_an_edit_made_while_the_build_was_running()
    {
        var path = CurationFile.PathFor(_root, "zeeland");
        var duringTheBuild = CurationFile.CreateEmpty();
        duringTheBuild.RemoveFile("later-verwijderd.jpg");
        duringTheBuild.Save(path);

        var anomalies = new Dictionary<string, AnomalyRecord> { ["NIKON D50"] = new("klok", AnomalyHandling.UseMtime, ["x.jpg"]) };
        CurationFile.SaveBuildResult(path, anomalies, _ => true);

        var saved = CurationFile.Load(path);
        Assert.Equal(["later-verwijderd.jpg"], saved.RemovedFiles);
        Assert.Contains("NIKON D50", saved.Anomalies.Keys);
    }

    [Fact]
    public void Saving_a_build_replaces_the_anomalies_and_drops_edits_whose_file_is_gone()
    {
        var path = CurationFile.PathFor(_root, "zeeland");
        var before = CurationFile.CreateEmpty();
        before.Anomalies["oud"] = new("oud", AnomalyHandling.UseMtime, []);
        before.RemoveFile("weg.jpg");
        before.Save(path);

        var dropped = CurationFile.SaveBuildResult(path, [], p => p != "weg.jpg");

        var saved = CurationFile.Load(path);
        Assert.Empty(saved.Anomalies);
        Assert.Empty(saved.RemovedFiles);
        Assert.Equal(1, dropped);
    }
}
