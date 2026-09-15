namespace Indexer.Curation;

// Issue #19's authority rule: never trust a majority, trust coinciding
// signals. A camera's own EXIF disagreeing with the rest of the folder is
// weak evidence on its own — a clock reset produces a large, internally
// consistent, entirely wrong cluster. What corroborates it is the file's
// own mtime (it can't predate being copied off the card) landing back
// inside the rest of the trip. Only that combination is confident enough to
// override EXIF; two disagreeing signals with nothing corroborating either
// one are left alone rather than guessed at (#19 §3).
//
// Separately, a file with no EXIF at all is a normal state (not an
// anomaly to resolve), but it still can't be placed on mtime — mtime can
// invent a date after the trip (#19 §7). It's placed by filename next to
// its nearest dated neighbour in the same folder instead.
public static class AnomalyDetector
{
    public sealed record MediaFact(string RelativePath, DateTimeOffset Mtime, DateTimeOffset? ExifCapturedAt, string? Camera);

    public sealed record DetectionResult(
        IReadOnlyDictionary<string, DateTimeOffset> EffectiveCapturedAt,
        IReadOnlyList<AnomalyReport> Anomalies);

    public static DetectionResult Detect(IReadOnlyList<MediaFact> files)
    {
        var effective = new Dictionary<string, DateTimeOffset>();
        var anomalies = new List<AnomalyReport>();

        DetectWrongCameraClocks(files, effective, anomalies);

        foreach (var file in files)
        {
            if (!effective.ContainsKey(file.RelativePath) && file.ExifCapturedAt is { } exif)
                effective[file.RelativePath] = exif;
        }

        PlaceUndatedFiles(files, effective, anomalies);

        return new DetectionResult(effective, anomalies);
    }

    private static void DetectWrongCameraClocks(
        IReadOnlyList<MediaFact> files, Dictionary<string, DateTimeOffset> effective, List<AnomalyReport> anomalies)
    {
        var byCamera = files
            .Where(f => f.Camera is not null && f.ExifCapturedAt is not null)
            .GroupBy(f => f.Camera!);

        foreach (var group in byCamera)
        {
            var groupFiles = group.ToList();
            var rest = files.Where(f => f.Camera != group.Key && f.ExifCapturedAt is not null).ToList();
            if (rest.Count == 0) continue; // nothing in this folder to compare against

            var groupExifRange = RangeOf(groupFiles.Select(f => f.ExifCapturedAt!.Value));
            var restExifRange = RangeOf(rest.Select(f => f.ExifCapturedAt!.Value));
            var groupMtimeRange = RangeOf(groupFiles.Select(f => f.Mtime));

            var exifDisagrees = !Overlaps(groupExifRange, restExifRange);
            var mtimeCorroborates = Overlaps(groupMtimeRange, restExifRange);
            if (!exifDisagrees || !mtimeCorroborates) continue;

            foreach (var file in groupFiles) effective[file.RelativePath] = file.Mtime;

            anomalies.Add(new AnomalyReport(
                Cause: group.Key,
                Message: $"{groupFiles.Count} bestand(en) van {group.Key} wijzen op een andere periode dan de rest " +
                         "van de map; hun bestandsdatum valt er wel binnen — vermoedelijk een verkeerd gezette " +
                         "cameraklok. Geplaatst op bestandsdatum in plaats van EXIF.",
                Handling: "use-mtime",
                AffectedFiles: groupFiles.Select(f => f.RelativePath).ToList()));
        }
    }

    private static void PlaceUndatedFiles(
        IReadOnlyList<MediaFact> files, Dictionary<string, DateTimeOffset> effective, List<AnomalyReport> anomalies)
    {
        var undated = files.Where(f => !effective.ContainsKey(f.RelativePath)).ToList();
        if (undated.Count == 0) return;

        var globalFallback = effective.Count > 0 ? effective.Values.Min() : DateTimeOffset.UnixEpoch;

        foreach (var folder in undated.Select(f => FolderOf(f.RelativePath)).Distinct())
        {
            var siblings = files
                .Where(f => FolderOf(f.RelativePath) == folder)
                .OrderBy(f => f.RelativePath, StringComparer.OrdinalIgnoreCase)
                .ToList();
            PlaceByFilenameOrder(siblings, effective, globalFallback);
        }

        anomalies.Add(new AnomalyReport(
            Cause: "geen-opnametijd",
            Message: $"{undated.Count} bestand(en) zonder opnametijd, geplaatst op volgorde van bestandsnaam.",
            Handling: "filename-order",
            AffectedFiles: undated.Select(f => f.RelativePath).ToList()));
    }

    // Forward pass anchors each undated file to the nearest preceding dated
    // (or now-placed) sibling; a backward pass then catches any leading run
    // that had nothing before it, anchoring to the nearest one that follows.
    // Ticks keep a run internally ordered and never collide with its anchor.
    private static void PlaceByFilenameOrder(
        List<MediaFact> siblings, Dictionary<string, DateTimeOffset> effective, DateTimeOffset globalFallback)
    {
        DateTimeOffset? anchor = null;
        var tick = 0;
        foreach (var file in siblings)
        {
            if (effective.TryGetValue(file.RelativePath, out var known))
            {
                anchor = known;
                tick = 0;
            }
            else if (anchor is { } a)
            {
                effective[file.RelativePath] = a.AddTicks(++tick);
            }
        }

        anchor = null;
        tick = 0;
        for (var i = siblings.Count - 1; i >= 0; i--)
        {
            var file = siblings[i];
            if (effective.TryGetValue(file.RelativePath, out var known))
            {
                anchor = known;
                tick = 0;
            }
            else if (anchor is { } a)
            {
                effective[file.RelativePath] = a.AddTicks(-++tick);
            }
            else
            {
                effective[file.RelativePath] = globalFallback;
            }
        }
    }

    private static string FolderOf(string relativePath)
    {
        var separatorIndex = relativePath.LastIndexOf('/');
        return separatorIndex < 0 ? "" : relativePath[..separatorIndex];
    }

    private static (DateTimeOffset Min, DateTimeOffset Max) RangeOf(IEnumerable<DateTimeOffset> values)
    {
        var list = values.ToList();
        return (list.Min(), list.Max());
    }

    private static bool Overlaps((DateTimeOffset Min, DateTimeOffset Max) a, (DateTimeOffset Min, DateTimeOffset Max) b) =>
        a.Min <= b.Max && b.Min <= a.Max;
}

public sealed record AnomalyReport(string Cause, string Message, string Handling, IReadOnlyList<string> AffectedFiles);
