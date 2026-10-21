using Indexer;
using Indexer.Catalog;
using Indexer.Curation;
using Indexer.Media;

namespace Indexer.Tests;

public class CatalogBuilderTests : IDisposable
{
    private readonly string _sourceDir;
    private readonly string _outputDir;
    private readonly string _curationDir;
    private readonly string _gazetteerPath;

    public CatalogBuilderTests()
    {
        var root = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        _sourceDir = Path.Combine(root, "source");
        _outputDir = Path.Combine(root, "output");
        _curationDir = Path.Combine(root, "curation");
        Directory.CreateDirectory(_sourceDir);

        _gazetteerPath = Path.Combine(root, "gazetteer.json");
        File.WriteAllText(_gazetteerPath, """{ "Zeeland": { "lat": 51.5, "lon": 3.8 } }""");
    }

    public void Dispose() => Directory.Delete(Path.GetDirectoryName(_sourceDir)!, recursive: true);

    [Fact]
    public void Builds_a_single_memory_with_one_hardcoded_chapter()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 4000, 3000, new DateTime(2016, 7, 2, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 4000, 3000, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var memory = Assert.Single(catalog.Memories);
        Assert.Equal("zeeland-2016", memory.Id);
        Assert.Equal("Zeeland 2016", memory.Name);
        Assert.Equal("Zeeland", memory.Destination!.Name);
        Assert.Equal(new Coordinate(51.5, 3.8), memory.Destination.Coordinate);

        var chapter = Assert.Single(memory.Chapters);
        Assert.Equal(2, chapter.MediaItems.Count);
    }

    [Fact]
    public void AppendFailure_leaves_the_exception_type_message_and_stack_in_the_memory_log()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));
        CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, TextWriter.Null);

        Exception thrown;
        try { throw new InvalidOperationException("outer", new IOException("inner boom")); }
        catch (Exception ex) { thrown = ex; }

        CatalogBuilder.AppendFailure(_curationDir, "zeeland-2016", thrown);

        var text = File.ReadAllText(CatalogBuilder.LogPathFor(_curationDir, "zeeland-2016"));
        Assert.Contains("InvalidOperationException", text);
        Assert.Contains("outer", text);
        Assert.Contains("inner boom", text);
        Assert.Contains(" at ", text);
    }

    [Fact]
    public void AppendFailure_does_not_throw_when_the_log_location_is_unwritable()
    {
        var blocker = Path.Combine(Path.GetDirectoryName(_sourceDir)!, "not-a-folder");
        File.WriteAllText(blocker, "x");

        CatalogBuilder.AppendFailure(Path.Combine(blocker, "curation"), "zeeland-2016", new InvalidOperationException("boom"));
    }
    [Fact]
    public void Orders_media_items_chronologically_regardless_of_filename()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var items = catalog.Memories[0].Chapters[0].MediaItems;
        Assert.True(items[0].CapturedAt < items[1].CapturedAt);
        Assert.EndsWith("-a", items[0].Id);
    }

    [Fact]
    public void Cover_image_is_the_earliest_item_and_the_file_exists()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "later.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "earliest.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var memory = catalog.Memories[0];
        Assert.Contains("earliest", memory.CoverImage);
        Assert.True(File.Exists(Path.Combine(_outputDir, memory.CoverImage)));
    }

    [Fact]
    public void A_fresh_index_publishes_a_mid_size_cover_next_to_the_pin_thumbnail()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 4000, 3000, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var memory = catalog.Memories[0];
        Assert.Equal($"media/{memory.Chapters[0].MediaItems[0].Id}-cover.jpg", memory.CoverPhoto);
        var published = PhotoMetadataReader.Read(Path.Combine(_outputDir, memory.CoverPhoto!));
        Assert.Equal(800, Math.Min(published.Width, published.Height));
        Assert.True(File.Exists(Path.Combine(_outputDir, memory.CoverImage)));
    }

    [Fact]
    public void Story_derivatives_exist_on_disk_and_are_referenced_by_a_relative_path()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 4000, 3000, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var item = catalog.Memories[0].Chapters[0].MediaItems[0];
        Assert.Equal(MediaKind.Photo, item.Type);
        Assert.True(File.Exists(Path.Combine(_outputDir, item.MediaRef)));
    }

    [Fact]
    public void Refuses_to_build_when_the_destination_is_not_seeded_in_the_gazetteer()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);

        Assert.Throws<KeyNotFoundException>(() =>
            CatalogBuilder.Build(_sourceDir, "Onbekend 2030", "Onbekend", gazetteer, _outputDir, _curationDir, TextWriter.Null));
    }

    [Fact]
    public void Chains_a_multi_day_trip_without_gps_into_one_chapter()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day1.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        // day 2 is skipped entirely, but that's only one empty day — not
        // enough on its own to split (#20/#31).
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day3.jpg"), 800, 600, new DateTime(2016, 7, 3, 9, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var chapter = Assert.Single(catalog.Memories[0].Chapters);
        Assert.Equal(2, chapter.MediaItems.Count);
        Assert.Null(chapter.Location);
    }

    [Fact]
    public void Splits_a_chapter_after_two_consecutive_empty_days_without_gps()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day1.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        // Days 2 and 3 are both empty — two consecutive empty days.
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day4.jpg"), 800, 600, new DateTime(2016, 7, 4, 9, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var chapters = catalog.Memories[0].Chapters;
        Assert.Equal(2, chapters.Count);
        Assert.Single(chapters[0].MediaItems);
        Assert.Single(chapters[1].MediaItems);
    }

    [Fact]
    public void Splits_within_a_single_day_on_a_large_gps_jump()
    {
        var morning = new Coordinate(0, 0);
        var afternoon = new Coordinate(0.1, 0); // ~11 km away — over the 5 km threshold
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "morning.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0), morning);
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "afternoon.jpg"), 800, 600, new DateTime(2016, 7, 1, 15, 0, 0), afternoon);

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var chapters = catalog.Memories[0].Chapters;
        Assert.Equal(2, chapters.Count);
        Assert.Equal(morning, chapters[0].Location);
        Assert.Equal(afternoon, chapters[1].Location);
    }

    [Fact]
    public void Suppresses_a_day_gap_boundary_when_gps_shows_the_same_place()
    {
        var place = new Coordinate(0, 0);
        var nearbyPlace = new Coordinate(0.02, 0); // ~2 km away — within the 5 km threshold
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day1.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0), place);
        // Two empty days would normally split this, but GPS shows it's the
        // same place before and after (#20's suppression rule).
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "day4.jpg"), 800, 600, new DateTime(2016, 7, 4, 9, 0, 0), nearbyPlace);

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var chapter = Assert.Single(catalog.Memories[0].Chapters);
        Assert.Equal(2, chapter.MediaItems.Count);
        Assert.Equal(place, chapter.Location);
    }

    [Fact]
    public void Flags_a_wrong_camera_clock_and_places_the_group_by_file_date_without_blocking_the_rest()
    {
        // The Schotland 2010 case: EXIF points to January (a reset clock),
        // but the files were copied off the card in August, same as the
        // rest of the trip — their file date says so.
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony1.jpg"), 800, 600, new DateTime(2010, 8, 1, 9, 0, 0), camera: "SONY DSC-W70");
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony2.jpg"), 800, 600, new DateTime(2010, 8, 7, 9, 0, 0), camera: "SONY DSC-W70");

        foreach (var name in new[] { "nikon1.jpg", "nikon2.jpg", "nikon3.jpg" })
        {
            var path = Path.Combine(_sourceDir, name);
            TestImages.WriteJpeg(path, 800, 600, new DateTime(2010, 1, 2, 9, 0, 0), camera: "NIKON D50");
            File.SetLastWriteTimeUtc(path, new DateTime(2010, 8, 6, 9, 0, 0, DateTimeKind.Utc));
        }

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Schotland 2010", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        // Non-blocking: all five files still end up as Media Items.
        var items = catalog.Memories[0].Chapters.SelectMany(c => c.MediaItems).ToList();
        Assert.Equal(5, items.Count);

        var curation = CurationFile.Load(CurationFile.PathFor(_curationDir, Slug.From("Schotland 2010")));
        var anomaly = curation.Anomalies["NIKON D50"];
        Assert.Equal(AnomalyHandling.UseMtime, anomaly.Handling);
        Assert.Equal(3, anomaly.AffectedFiles.Count);
    }

    [Fact]
    public void A_memorys_date_is_its_earliest_capture_day_after_the_camera_clock_correction()
    {
        // Same Schotland 2010 case: the Nikon's raw EXIF says 2 January, but
        // the corrected trip starts with the Sony on 1 August.
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony1.jpg"), 800, 600, new DateTime(2010, 8, 1, 9, 0, 0), camera: "SONY DSC-W70");
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony2.jpg"), 800, 600, new DateTime(2010, 8, 7, 9, 0, 0), camera: "SONY DSC-W70");

        foreach (var name in new[] { "nikon1.jpg", "nikon2.jpg", "nikon3.jpg" })
        {
            var path = Path.Combine(_sourceDir, name);
            TestImages.WriteJpeg(path, 800, 600, new DateTime(2010, 1, 2, 9, 0, 0), camera: "NIKON D50");
            File.SetLastWriteTimeUtc(path, new DateTime(2010, 8, 6, 9, 0, 0, DateTimeKind.Utc));
        }

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Schotland 2010", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        Assert.Equal(new DateOnly(2010, 8, 1), catalog.Memories[0].Date);
        Assert.Equal(2, catalog.SchemaVersion);
    }

    [Fact]
    public void Flags_files_without_capture_time_and_places_them_by_filename_instead_of_a_fabricated_mtime()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a_photo.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));

        foreach (var name in new[] { "pano_1.jpg", "pano_2.jpg" })
        {
            var path = Path.Combine(_sourceDir, name);
            TestImages.WriteJpeg(path, 800, 600, capturedAt: null);
            // A stitched panorama's mtime lies about when the trip was — it
            // must never be silently trusted for placement (#19 §7/#33).
            File.SetLastWriteTimeUtc(path, new DateTime(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        }

        TestImages.WriteJpeg(Path.Combine(_sourceDir, "z_photo.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var items = catalog.Memories[0].Chapters.SelectMany(c => c.MediaItems).ToList();
        Assert.Equal(4, items.Count);

        var order = items.Select(i => i.Id).ToList();
        int IndexOfSuffix(string suffix) => order.FindIndex(id => id.EndsWith("-" + suffix));
        Assert.True(IndexOfSuffix("a-photo") < IndexOfSuffix("pano-1"));
        Assert.True(IndexOfSuffix("pano-1") < IndexOfSuffix("pano-2"));
        Assert.True(IndexOfSuffix("pano-2") < IndexOfSuffix("z-photo"));

        var curation = CurationFile.Load(CurationFile.PathFor(_curationDir, Slug.From("Zeeland 2016")));
        var anomaly = curation.Anomalies["geen-opnametijd"];
        Assert.Equal(AnomalyHandling.FilenameOrder, anomaly.Handling);
        Assert.Equal(2, anomaly.AffectedFiles.Count);
    }

    [Fact]
    public void A_curation_entry_stays_correct_when_more_files_matching_the_same_cause_are_added_later()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony1.jpg"), 800, 600, new DateTime(2010, 8, 1, 9, 0, 0), camera: "SONY DSC-W70");
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony2.jpg"), 800, 600, new DateTime(2010, 8, 7, 9, 0, 0), camera: "SONY DSC-W70");
        var nikon1 = Path.Combine(_sourceDir, "nikon1.jpg");
        TestImages.WriteJpeg(nikon1, 800, 600, new DateTime(2010, 1, 2, 9, 0, 0), camera: "NIKON D50");
        File.SetLastWriteTimeUtc(nikon1, new DateTime(2010, 8, 6, 9, 0, 0, DateTimeKind.Utc));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        CatalogBuilder.Build(_sourceDir, "Schotland 2010", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var curationPath = CurationFile.PathFor(_curationDir, Slug.From("Schotland 2010"));
        Assert.Single(CurationFile.Load(curationPath).Anomalies["NIKON D50"].AffectedFiles);

        // A second Nikon file, from the same broken camera, turns up later.
        var nikon2 = Path.Combine(_sourceDir, "nikon2.jpg");
        TestImages.WriteJpeg(nikon2, 800, 600, new DateTime(2010, 1, 3, 9, 0, 0), camera: "NIKON D50");
        File.SetLastWriteTimeUtc(nikon2, new DateTime(2010, 8, 6, 10, 0, 0, DateTimeKind.Utc));

        CatalogBuilder.Build(_sourceDir, "Schotland 2010", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var reloaded = CurationFile.Load(curationPath);
        Assert.Equal(2, reloaded.Anomalies["NIKON D50"].AffectedFiles.Count);
    }

    [Fact]
    public void Checks_the_gazetteer_before_reading_the_source_folder()
    {
        // A Source Folder that doesn't exist would make SourceFolderReader.Read
        // throw DirectoryNotFoundException — so seeing the Gazetteer's
        // KeyNotFoundException instead proves the lookup ran first (#38).
        var missingSourceDir = Path.Combine(Path.GetDirectoryName(_sourceDir)!, "does-not-exist");
        var gazetteer = Gazetteer.Load(_gazetteerPath);

        Assert.Throws<KeyNotFoundException>(() =>
            CatalogBuilder.Build(missingSourceDir, "Onbekend 2030", "Onbekend", gazetteer, _outputDir, _curationDir, TextWriter.Null));
    }

    [Fact]
    public void Refuses_a_source_folder_with_no_photo_at_all_before_the_slow_pass()
    {
        // No real video content needed: MediaFile.IsVideo comes from the
        // extension alone (SourceFolderReader), so this check — like the
        // Gazetteer one above — fires before VideoMetadataReader ever
        // touches the file.
        File.WriteAllBytes(Path.Combine(_sourceDir, "clip.mp4"), []);

        var gazetteer = Gazetteer.Load(_gazetteerPath);

        var ex = Assert.Throws<InvalidOperationException>(() =>
            CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null));
        Assert.Contains("cover", ex.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void An_unwritable_curation_file_warns_but_does_not_block_the_rest_of_the_run()
    {
        // Real-world case: the Curation-folder sits somewhere the operator
        // normally has write access, but that can still fail transiently.
        // The curation file is a record for the operator, not something the
        // catalogue depends on — losing it must not sink the whole run
        // (matches the anomalies themselves already being non-blocking,
        // see #19/#33).
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony1.jpg"), 800, 600, new DateTime(2010, 8, 1, 9, 0, 0), camera: "SONY DSC-W70");
        var nikon1 = Path.Combine(_sourceDir, "nikon1.jpg");
        TestImages.WriteJpeg(nikon1, 800, 600, new DateTime(2010, 1, 2, 9, 0, 0), camera: "NIKON D50");
        File.SetLastWriteTimeUtc(nikon1, new DateTime(2010, 8, 6, 9, 0, 0, DateTimeKind.Utc));

        // A directory sitting at the curation file's path makes
        // File.WriteAllText fail with UnauthorizedAccessException, standing
        // in for a permission-denied write without needing real ACLs.
        Directory.CreateDirectory(CurationFile.PathFor(_curationDir, Slug.From("Schotland 2010")));

        var log = new StringWriter();
        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Schotland 2010", "Zeeland", gazetteer, _outputDir, _curationDir, log);

        var items = catalog.Memories[0].Chapters.SelectMany(c => c.MediaItems).ToList();
        Assert.Equal(2, items.Count);
        Assert.Contains("curation", log.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void An_unwritable_curation_folder_itself_warns_but_does_not_block_the_rest_of_the_run()
    {
        // Same non-blocking guarantee, but for the folder that would hold
        // both the log file and the curation file, not just the curation
        // file within it — e.g. the configured location is briefly
        // unreachable (a NAS hiccup).
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));

        // A file sitting at the Curation-folder's own path makes
        // Directory.CreateDirectory fail with IOException.
        File.WriteAllText(_curationDir, "");

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var items = catalog.Memories[0].Chapters.SelectMany(c => c.MediaItems).ToList();
        Assert.Single(items);
    }

    [Fact]
    public void Cancelling_a_first_time_index_deletes_every_media_file_it_already_wrote()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "c.jpg"), 800, 600, new DateTime(2016, 7, 1, 10, 0, 0));

        using var cts = new CancellationTokenSource();
        // Fires once the first (cover) item's derivatives are on disk, so
        // there's something to prove got cleaned up — cancellation is only
        // noticed at the top of the *next* loop iteration (see
        // CatalogBuilder.cs), so item b never gets published at all.
        void CancelAfterFirstItem(int current, int total)
        {
            if (current == 4) cts.Cancel(); // step 4 = item a's publish step (3 read + 1 publish)
        }

        var gazetteer = Gazetteer.Load(_gazetteerPath);

        Assert.Throws<OperationCanceledException>(() =>
            CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null,
                onProgress: CancelAfterFirstItem, cancellationToken: cts.Token));

        var mediaDir = Path.Combine(_outputDir, "media");
        Assert.Empty(Directory.GetFiles(mediaDir));
    }

    [Fact]
    public void Cancelling_a_reindex_leaves_previously_published_files_in_place()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));

        var gazetteer = Gazetteer.Load(_gazetteerPath);
        CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);

        var mediaDir = Path.Combine(_outputDir, "media");
        var publishedBefore = Directory.GetFiles(mediaDir).ToList();
        Assert.NotEmpty(publishedBefore); // a's story + thumb, b's story

        // Two more photos turn up before the reindex — c is genuinely new,
        // d never gets reached at all.
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "c.jpg"), 800, 600, new DateTime(2016, 7, 1, 10, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "d.jpg"), 800, 600, new DateTime(2016, 7, 1, 11, 0, 0));

        using var cts = new CancellationTokenSource();
        // 4 files: steps 1-4 read, 5-8 publish (a,b,c,d in that chronological
        // order). Cancel once c (step 7) is on disk, before d is reached.
        void CancelAfterThirdItem(int current, int total)
        {
            if (current == 7) cts.Cancel();
        }

        Assert.Throws<OperationCanceledException>(() =>
            CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null,
                onProgress: CancelAfterThirdItem, cancellationToken: cts.Token));

        foreach (var path in publishedBefore) Assert.True(File.Exists(path), $"{path} should have survived the cancelled reindex.");
        Assert.Equal(publishedBefore.Count, Directory.GetFiles(mediaDir).Length); // c's new file cleaned up, d's never wrote
    }

    // A share drops a read now and then, and WIC reports that as "the image
    // decoder cannot decode the image" without naming the file. One bad file
    // used to sink a run of hundreds; it must be skipped, and named.
    [Fact]
    public void A_file_that_cannot_be_decoded_is_skipped_and_named_instead_of_failing_the_run()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));
        File.WriteAllBytes(Path.Combine(_sourceDir, "kapot.jpg"), [1, 2, 3, 4, 5]);

        var log = new StringWriter();
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, log,
            retryDelay: TimeSpan.Zero);

        Assert.Equal(2, catalog.Memories[0].Chapters.Sum(chapter => chapter.MediaItems.Count));
        Assert.Contains("kapot.jpg", log.ToString());
    }

    [Fact]
    public void A_run_where_no_file_can_be_read_fails_and_says_so()
    {
        File.WriteAllBytes(Path.Combine(_sourceDir, "kapot1.jpg"), [1, 2, 3]);
        File.WriteAllBytes(Path.Combine(_sourceDir, "kapot2.jpg"), [4, 5, 6]);

        var ex = Assert.Throws<InvalidOperationException>(() => CatalogBuilder.Build(
            _sourceDir, "Zeeland 2016", "Zeeland", Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, TextWriter.Null,
            retryDelay: TimeSpan.Zero));
        Assert.Contains("leesbaar", ex.Message);
    }

    [Fact]
    public async Task A_read_that_fails_once_is_retried_and_the_file_still_makes_it_in()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 8, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));

        // Holds b.jpg open exclusively for a moment, then lets go while the
        // builder is waiting out its first retry.
        var blocked = new FileStream(Path.Combine(_sourceDir, "b.jpg"), FileMode.Open, FileAccess.Read, FileShare.None);
        var release = Task.Run(async () => { await Task.Delay(400); blocked.Dispose(); });

        var log = new StringWriter();
        var catalog = CatalogBuilder.Build(_sourceDir, "Zeeland 2016", "Zeeland", Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, log,
            retryDelay: TimeSpan.FromMilliseconds(300));
        await release;

        Assert.Equal(2, catalog.Memories[0].Chapters.Sum(chapter => chapter.MediaItems.Count));
        Assert.DoesNotContain("Overgeslagen", log.ToString());
    }

    private string MakeFolder(string name)
    {
        var path = Path.Combine(Path.GetDirectoryName(_sourceDir)!, name);
        Directory.CreateDirectory(path);
        return path;
    }

    [Fact]
    public void A_memory_from_two_folders_is_one_chronological_sequence_with_chapters_across_both()
    {
        var first = MakeFolder("first");
        var second = MakeFolder("second");
        TestImages.WriteJpeg(Path.Combine(first, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(first, "c.jpg"), 800, 600, new DateTime(2016, 7, 10, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(second, "b.jpg"), 800, 600, new DateTime(2016, 7, 5, 9, 0, 0));

        var catalog = CatalogBuilder.Build([first, second], "Zeeland 2016", "Zeeland", Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, TextWriter.Null);

        var memory = Assert.Single(catalog.Memories);
        var items = memory.Chapters.SelectMany(c => c.MediaItems).ToList();
        Assert.Equal(3, items.Count);
        Assert.Equal(items.OrderBy(i => i.CapturedAt), items);
        // July 1 -> 5 -> 10 leaves two empty days each time: three Chapters, each from the other folder than its neighbour.
        Assert.Equal(3, memory.Chapters.Count);
    }

    [Fact]
    public void Nested_folders_do_not_produce_duplicate_media_items()
    {
        var parent = MakeFolder("trip");
        var child = Path.Combine(parent, "day2");
        Directory.CreateDirectory(child);
        TestImages.WriteJpeg(Path.Combine(parent, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(child, "b.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));

        var catalog = CatalogBuilder.Build([parent, child], "Zeeland 2016", "Zeeland", Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, TextWriter.Null);

        Assert.Equal(2, catalog.Memories[0].Chapters.SelectMany(c => c.MediaItems).Count());
    }

    [Fact]
    public void One_folder_in_two_memories_publishes_two_independent_memories_without_filename_collisions()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        var gazetteer = Gazetteer.Load(_gazetteerPath);

        var one = CatalogBuilder.Build([_sourceDir], "Zeeland 2016", "Zeeland", gazetteer, _outputDir, _curationDir, TextWriter.Null);
        var two = CatalogBuilder.Build([_sourceDir], "Zomer in Zeeland", null, gazetteer, _outputDir, _curationDir, TextWriter.Null);

        static IEnumerable<string> Files(RwMemory m) =>
            m.Chapters.SelectMany(c => c.MediaItems).Select(i => i.MediaRef).Append(m.CoverImage).Append(m.CoverPhoto!);
        Assert.Empty(Files(one.Memories[0]).Intersect(Files(two.Memories[0])));
        Assert.All(Files(one.Memories[0]).Concat(Files(two.Memories[0])), f => Assert.True(File.Exists(Path.Combine(_outputDir, f))));
    }

    [Fact]
    public void A_memory_without_a_destination_builds_even_when_the_gazetteer_knows_nothing()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));

        var catalog = CatalogBuilder.Build([_sourceDir], "Verjaardag Opa", null, Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, TextWriter.Null);

        Assert.Null(catalog.Memories[0].Destination);
        Assert.Equal(new DateOnly(2016, 7, 1), catalog.Memories[0].Date);
    }

    // ---- the operator's edits survive a build (#66)

    private string CurationPath(string memoryName) => CurationFile.PathFor(_curationDir, Slug.From(memoryName));

    private void Curated(string memoryName, Action<CurationFile> edits)
    {
        Directory.CreateDirectory(_curationDir);
        var curation = CurationFile.CreateEmpty();
        edits(curation);
        curation.Save(CurationPath(memoryName));
    }

    private RwCatalog BuildZeeland(params string[] folders) =>
        CatalogBuilder.Build(folders.Length == 0 ? [_sourceDir] : folders, "Zeeland 2016", "Zeeland", Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, TextWriter.Null);

    private static List<RwMediaItem> Items(RwCatalog catalog) => catalog.Memories[0].Chapters.SelectMany(c => c.MediaItems).ToList();

    [Fact]
    public void A_removed_photo_stays_out_of_every_later_build()
    {
        var a = Path.Combine(_sourceDir, "a.jpg");
        TestImages.WriteJpeg(a, 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 1, 10, 0, 0));
        Curated("Zeeland 2016", c => c.RemoveFile(a));

        var items = Items(BuildZeeland());

        Assert.EndsWith("-b", Assert.Single(items).Id);
    }

    [Fact]
    public void The_chosen_cover_stays_the_cover_even_when_an_earlier_photo_arrives()
    {
        var b = Path.Combine(_sourceDir, "b.jpg");
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        TestImages.WriteJpeg(b, 800, 600, new DateTime(2016, 7, 1, 10, 0, 0));
        Curated("Zeeland 2016", c => c.SetCover(b));

        var memory = BuildZeeland().Memories[0];

        Assert.EndsWith("-b-thumb.jpg", memory.CoverImage);
        Assert.EndsWith("-b-cover.jpg", memory.CoverPhoto);
        Assert.True(File.Exists(Path.Combine(_outputDir, memory.CoverImage)));
    }

    [Fact]
    public void When_the_chosen_cover_is_gone_the_earliest_remaining_photo_is_the_cover()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 1, 10, 0, 0));
        Curated("Zeeland 2016", c => c.SetCover(Path.Combine(_sourceDir, "weg.jpg")));

        var memory = BuildZeeland().Memories[0];

        Assert.EndsWith("-a-thumb.jpg", memory.CoverImage);
        Assert.Null(CurationFile.Load(CurationPath("Zeeland 2016")).CoverFile);
    }

    [Fact]
    public void A_rotation_is_reapplied_to_the_photo()
    {
        var a = Path.Combine(_sourceDir, "a.jpg");
        TestImages.WriteJpeg(a, 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 1, 10, 0, 0));
        Curated("Zeeland 2016", c => c.Rotate(a));

        var items = Items(BuildZeeland());

        var rotated = PhotoMetadataReader.Read(Path.Combine(_outputDir, items.Single(i => i.Id.EndsWith("-a")).MediaRef));
        Assert.True(rotated.Height > rotated.Width, "a 90 degree turn makes the landscape photo a portrait");
        var untouched = PhotoMetadataReader.Read(Path.Combine(_outputDir, items.Single(i => i.Id.EndsWith("-b")).MediaRef));
        Assert.True(untouched.Width > untouched.Height);
    }

    [Fact]
    public void A_rotation_does_not_pile_up_over_repeated_builds()
    {
        var a = Path.Combine(_sourceDir, "a.jpg");
        TestImages.WriteJpeg(a, 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        Curated("Zeeland 2016", c => c.Rotate(a));

        BuildZeeland();
        var second = BuildZeeland();

        var size = PhotoMetadataReader.Read(Path.Combine(_outputDir, Items(second)[0].MediaRef));
        Assert.True(size.Height > size.Width);
    }

    [Fact]
    public void Edits_to_a_file_that_has_vanished_do_not_break_the_build_and_are_dropped()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        var vanished = Path.Combine(_sourceDir, "verdwenen.jpg");
        Curated("Zeeland 2016", c => { c.RemoveFile(vanished); c.Rotate(vanished); });

        var items = Items(BuildZeeland());

        Assert.Single(items);
        var curation = CurationFile.Load(CurationPath("Zeeland 2016"));
        Assert.Empty(curation.RemovedFiles);
        Assert.Empty(curation.Rotations);
    }

    [Fact]
    public void Every_build_writes_the_item_map_from_media_item_ids_to_source_files()
    {
        var a = Path.Combine(_sourceDir, "a.jpg");
        var b = Path.Combine(_sourceDir, "b.jpg");
        TestImages.WriteJpeg(a, 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        TestImages.WriteJpeg(b, 800, 600, new DateTime(2016, 7, 1, 10, 0, 0));

        var items = Items(BuildZeeland());

        var map = ItemMap.Load(ItemMap.PathFor(_curationDir, "zeeland-2016"))!;
        Assert.Equal(Path.GetFullPath(a), map[items.Single(i => i.Id.EndsWith("-a")).Id]);
        Assert.Equal(Path.GetFullPath(b), map[items.Single(i => i.Id.EndsWith("-b")).Id]);
    }

    [Fact]
    public void Edits_stay_attached_to_their_file_when_a_folder_is_added_and_the_ids_shift()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 2, 9, 0, 0));
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "b.jpg"), 800, 600, new DateTime(2016, 7, 2, 10, 0, 0));
        var earlier = MakeFolder("earlier");
        TestImages.WriteJpeg(Path.Combine(earlier, "vroeg.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        Curated("Zeeland 2016", c => c.RemoveFile(Path.Combine(_sourceDir, "a.jpg")));

        var items = Items(BuildZeeland(_sourceDir, earlier));

        Assert.Equal(2, items.Count);
        Assert.DoesNotContain(items, i => i.Id.EndsWith("-a"));
        Assert.Contains(items, i => i.Id.EndsWith("-vroeg"));
    }

    [Fact]
    public void The_anomalies_a_build_finds_and_the_operators_edits_live_in_the_same_curation_file()
    {
        var removed = Path.Combine(_sourceDir, "extra.jpg");
        TestImages.WriteJpeg(removed, 800, 600, new DateTime(2010, 8, 3, 9, 0, 0), camera: "CANON EOS");
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony1.jpg"), 800, 600, new DateTime(2010, 8, 1, 9, 0, 0), camera: "SONY DSC-W70");
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "sony2.jpg"), 800, 600, new DateTime(2010, 8, 7, 9, 0, 0), camera: "SONY DSC-W70");
        foreach (var name in new[] { "nikon1.jpg", "nikon2.jpg", "nikon3.jpg" })
        {
            var path = Path.Combine(_sourceDir, name);
            TestImages.WriteJpeg(path, 800, 600, new DateTime(2010, 1, 2, 9, 0, 0), camera: "NIKON D50");
            File.SetLastWriteTimeUtc(path, new DateTime(2010, 8, 6, 9, 0, 0, DateTimeKind.Utc));
        }
        Curated("Schotland 2010", c => c.RemoveFile(removed));

        CatalogBuilder.Build(_sourceDir, "Schotland 2010", "Zeeland", Gazetteer.Load(_gazetteerPath), _outputDir, _curationDir, TextWriter.Null);

        var curation = CurationFile.Load(CurationPath("Schotland 2010"));
        Assert.Contains("NIKON D50", curation.Anomalies.Keys);
        Assert.Equal([removed], curation.RemovedFiles);
    }

    [Fact]
    public void The_catalogue_never_contains_a_source_path()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));

        var json = System.Text.Json.JsonSerializer.Serialize(BuildZeeland(), JsonOptions.Default);

        // JSON escapes a backslash, so look for both spellings of the folder.
        Assert.DoesNotContain(_sourceDir, json);
        Assert.DoesNotContain(_sourceDir.Replace("\\", "\\\\"), json);
    }

    [Fact]
    public void An_edit_for_a_file_outside_the_memorys_folders_is_kept_while_the_file_still_exists()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        var other = MakeFolder("andere-map");
        var elsewhere = Path.Combine(other, "verwijderd.jpg");
        TestImages.WriteJpeg(elsewhere, 800, 600, new DateTime(2016, 7, 1, 10, 0, 0));
        Curated("Zeeland 2016", c => c.RemoveFile(elsewhere));

        BuildZeeland();

        // the folder was taken out of the Memory, but re-adding it later must not bring the removed photo back
        Assert.Equal([elsewhere], CurationFile.Load(CurationPath("Zeeland 2016")).RemovedFiles);
    }

    [Fact]
    public void An_edit_for_a_file_in_a_folder_that_cannot_be_reached_is_kept_rather_than_assumed_gone()
    {
        TestImages.WriteJpeg(Path.Combine(_sourceDir, "a.jpg"), 800, 600, new DateTime(2016, 7, 1, 9, 0, 0));
        var unreachable = Path.Combine(Path.GetDirectoryName(_sourceDir)!, "nas-offline", "x.jpg");
        Curated("Zeeland 2016", c => c.RemoveFile(unreachable));

        BuildZeeland();

        Assert.Equal([unreachable], CurationFile.Load(CurationPath("Zeeland 2016")).RemovedFiles);
    }
}
