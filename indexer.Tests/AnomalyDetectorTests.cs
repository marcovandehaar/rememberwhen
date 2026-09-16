using Indexer.Curation;

namespace Indexer.Tests;

public class AnomalyDetectorTests
{
    private static DateTimeOffset D(int month, int day, int hour = 9) => new(2010, month, day, hour, 0, 0, TimeSpan.Zero);

    [Fact]
    public void A_camera_whose_exif_disagrees_with_everyone_but_whose_mtime_agrees_is_flagged_and_placed_on_mtime()
    {
        // The Schotland 2010 case: three Nikon files carry a January EXIF
        // date (a reset clock) but were copied off the card in August, same
        // as the rest of the trip — their mtime says so.
        var files = new[]
        {
            new AnomalyDetector.MediaFact("nikon1.jpg", Mtime: D(8, 6), ExifCapturedAt: D(1, 2), Camera: "NIKON D50"),
            new AnomalyDetector.MediaFact("nikon2.jpg", Mtime: D(8, 6), ExifCapturedAt: D(1, 2), Camera: "NIKON D50"),
            new AnomalyDetector.MediaFact("nikon3.jpg", Mtime: D(8, 6), ExifCapturedAt: D(1, 3), Camera: "NIKON D50"),
            new AnomalyDetector.MediaFact("sony1.jpg", Mtime: D(8, 1), ExifCapturedAt: D(8, 1), Camera: "SONY DSC-W70"),
            new AnomalyDetector.MediaFact("sony2.jpg", Mtime: D(8, 7), ExifCapturedAt: D(8, 7), Camera: "SONY DSC-W70"),
        };

        var result = AnomalyDetector.Detect(files);

        Assert.Equal(D(8, 6), result.EffectiveCapturedAt["nikon1.jpg"]);
        Assert.Equal(D(8, 6), result.EffectiveCapturedAt["nikon2.jpg"]);
        Assert.Equal(D(8, 6), result.EffectiveCapturedAt["nikon3.jpg"]);
        Assert.Equal(D(8, 1), result.EffectiveCapturedAt["sony1.jpg"]);
        Assert.Equal(D(8, 7), result.EffectiveCapturedAt["sony2.jpg"]);

        var anomaly = Assert.Single(result.Anomalies);
        Assert.Equal("NIKON D50", anomaly.Cause);
        Assert.Equal(AnomalyHandling.UseMtime, anomaly.Handling);
        Assert.Equal(["nikon1.jpg", "nikon2.jpg", "nikon3.jpg"], anomaly.AffectedFiles);
    }

    [Fact]
    public void A_camera_group_copied_a_day_after_the_trip_ended_is_still_corroborated()
    {
        // The real Schotland 2010 shape (#39): the whole folder was copied
        // off cards in one batch on 6 August, a day after the last Sony
        // photo's own capture time (5 August) — so the Nikon group's mtime
        // falls just past the rest's own EXIF range, not inside it. A
        // handful of Sony files also carry that same batch-copy mtime
        // (their own EXIF is untouched by it), which is incidental here —
        // corroboration is checked against the rest's EXIF range widened by
        // a plausible copy delay, not against the rest's own mtimes.
        var files = new[]
        {
            new AnomalyDetector.MediaFact("nikon1.jpg", Mtime: D(8, 6, 21), ExifCapturedAt: D(1, 30), Camera: "NIKON D50"),
            new AnomalyDetector.MediaFact("nikon2.jpg", Mtime: D(8, 6, 21), ExifCapturedAt: D(1, 30), Camera: "NIKON D50"),
            new AnomalyDetector.MediaFact("nikon3.jpg", Mtime: D(8, 6, 21), ExifCapturedAt: D(1, 30), Camera: "NIKON D50"),
            new AnomalyDetector.MediaFact("sony1.jpg", Mtime: D(8, 3), ExifCapturedAt: D(8, 3), Camera: "SONY DSC-W70"),
            new AnomalyDetector.MediaFact("sony2.jpg", Mtime: D(8, 6, 21), ExifCapturedAt: D(8, 5), Camera: "SONY DSC-W70"),
        };

        var result = AnomalyDetector.Detect(files);

        Assert.Equal(D(8, 6, 21), result.EffectiveCapturedAt["nikon1.jpg"]);
        Assert.Equal(D(8, 6, 21), result.EffectiveCapturedAt["nikon2.jpg"]);
        Assert.Equal(D(8, 6, 21), result.EffectiveCapturedAt["nikon3.jpg"]);

        var anomaly = Assert.Single(result.Anomalies);
        Assert.Equal("NIKON D50", anomaly.Cause);
        Assert.Equal(AnomalyHandling.UseMtime, anomaly.Handling);
        Assert.Equal(["nikon1.jpg", "nikon2.jpg", "nikon3.jpg"], anomaly.AffectedFiles);
    }

    [Fact]
    public void The_correct_majority_is_not_flagged_just_because_a_batch_copy_gave_it_the_same_mtime_as_the_broken_minority()
    {
        // A whole-folder batch copy gives Sony files the same mtime as the
        // Nikon group it copied alongside — corroborating the minority's
        // mtime against the majority's own mtime range (rather than its
        // EXIF range) would make this cut both ways and flag the Sony
        // majority too, using Nikon's own broken January EXIF as "the rest".
        var files = new[]
        {
            new AnomalyDetector.MediaFact("nikon1.jpg", Mtime: D(8, 6, 21), ExifCapturedAt: D(1, 30), Camera: "NIKON D50"),
            new AnomalyDetector.MediaFact("nikon2.jpg", Mtime: D(8, 6, 21), ExifCapturedAt: D(1, 30), Camera: "NIKON D50"),
            new AnomalyDetector.MediaFact("sony1.jpg", Mtime: D(8, 3), ExifCapturedAt: D(8, 3), Camera: "SONY DSC-W70"),
            new AnomalyDetector.MediaFact("sony2.jpg", Mtime: D(8, 6, 21), ExifCapturedAt: D(8, 5), Camera: "SONY DSC-W70"),
        };

        var result = AnomalyDetector.Detect(files);

        var anomaly = Assert.Single(result.Anomalies);
        Assert.Equal("NIKON D50", anomaly.Cause);
        Assert.Equal(D(8, 3), result.EffectiveCapturedAt["sony1.jpg"]);
        Assert.Equal(D(8, 5), result.EffectiveCapturedAt["sony2.jpg"]);
    }

    [Fact]
    public void A_camera_whose_exif_and_mtime_both_disagree_with_everyone_is_not_flagged()
    {
        // No corroborating signal — could just be separate content (a
        // different trip entirely), so #19 says don't guess.
        var files = new[]
        {
            new AnomalyDetector.MediaFact("old1.jpg", Mtime: D(1, 2), ExifCapturedAt: D(1, 2), Camera: "OLD CAMERA"),
            new AnomalyDetector.MediaFact("sony1.jpg", Mtime: D(8, 1), ExifCapturedAt: D(8, 1), Camera: "SONY DSC-W70"),
            new AnomalyDetector.MediaFact("sony2.jpg", Mtime: D(8, 7), ExifCapturedAt: D(8, 7), Camera: "SONY DSC-W70"),
        };

        var result = AnomalyDetector.Detect(files);

        Assert.Empty(result.Anomalies);
        Assert.Equal(D(1, 2), result.EffectiveCapturedAt["old1.jpg"]);
    }

    [Fact]
    public void A_single_camera_folder_has_nothing_to_compare_against_and_is_not_flagged()
    {
        var files = new[]
        {
            new AnomalyDetector.MediaFact("a.jpg", Mtime: D(1, 1), ExifCapturedAt: D(1, 1), Camera: "SONY DSC-W70"),
            new AnomalyDetector.MediaFact("b.jpg", Mtime: D(1, 2), ExifCapturedAt: D(1, 2), Camera: "SONY DSC-W70"),
        };

        var result = AnomalyDetector.Detect(files);

        Assert.Empty(result.Anomalies);
    }

    [Fact]
    public void Files_without_exif_are_reported_and_placed_next_to_their_dated_neighbour_by_filename()
    {
        // Five stitched panoramas, no EXIF at all, mtime lies (dated after
        // the trip) — must never be silently placed on that mtime.
        var files = new[]
        {
            new AnomalyDetector.MediaFact("day/a_photo.jpg", Mtime: D(7, 1), ExifCapturedAt: D(7, 1), Camera: "SONY DSC-W70"),
            new AnomalyDetector.MediaFact("day/pano_1.jpg", Mtime: D(9, 1), ExifCapturedAt: null, Camera: null),
            new AnomalyDetector.MediaFact("day/pano_2.jpg", Mtime: D(9, 1), ExifCapturedAt: null, Camera: null),
            new AnomalyDetector.MediaFact("day/z_photo.jpg", Mtime: D(7, 2), ExifCapturedAt: D(7, 2), Camera: "SONY DSC-W70"),
        };

        var result = AnomalyDetector.Detect(files);

        var anomaly = Assert.Single(result.Anomalies);
        Assert.Equal("geen-opnametijd", anomaly.Cause);
        Assert.Equal(AnomalyHandling.FilenameOrder, anomaly.Handling);
        Assert.Equal(["day/pano_1.jpg", "day/pano_2.jpg"], anomaly.AffectedFiles);

        // Placed between their filename-neighbours, strictly increasing, and
        // nowhere near the lying mtime (September).
        var a = result.EffectiveCapturedAt["day/a_photo.jpg"];
        var pano1 = result.EffectiveCapturedAt["day/pano_1.jpg"];
        var pano2 = result.EffectiveCapturedAt["day/pano_2.jpg"];
        var z = result.EffectiveCapturedAt["day/z_photo.jpg"];
        Assert.True(a < pano1);
        Assert.True(pano1 < pano2);
        Assert.True(pano2 < z);
    }

    [Fact]
    public void A_leading_run_of_undated_files_anchors_to_the_first_dated_sibling_that_follows()
    {
        var files = new[]
        {
            new AnomalyDetector.MediaFact("day/a_pano.jpg", Mtime: D(9, 1), ExifCapturedAt: null, Camera: null),
            new AnomalyDetector.MediaFact("day/b_pano.jpg", Mtime: D(9, 1), ExifCapturedAt: null, Camera: null),
            new AnomalyDetector.MediaFact("day/c_photo.jpg", Mtime: D(7, 1), ExifCapturedAt: D(7, 1), Camera: "SONY DSC-W70"),
        };

        var result = AnomalyDetector.Detect(files);

        var aPano = result.EffectiveCapturedAt["day/a_pano.jpg"];
        var bPano = result.EffectiveCapturedAt["day/b_pano.jpg"];
        var cPhoto = result.EffectiveCapturedAt["day/c_photo.jpg"];
        Assert.True(aPano < bPano);
        Assert.True(bPano < cPhoto);
    }
}
