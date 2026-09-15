namespace Indexer.Catalog;

// The two-layer heuristic decided in issue #20: chain consecutive calendar
// days into one Chapter, and let GPS (present on only ~23% of the library,
// all-or-nothing per camera) refine that — add a boundary within a single
// day, suppress a day-gap boundary when it's really the same place, or just
// confirm it. Pure and stateless so #28's replaced one-hardcoded-Chapter
// stopgap can be driven straight off the chronologically ordered sequence.
public static class ChapterBoundaries
{
    private const double GpsJumpThresholdKm = 5.0;
    private const int EmptyDaysThreshold = 2;

    public static bool IsBoundary(
        DateTimeOffset previousCapturedAt, Coordinate? previousGps,
        DateTimeOffset nextCapturedAt, Coordinate? nextGps)
    {
        var emptyDaysBetween = (nextCapturedAt.Date - previousCapturedAt.Date).Days - 1;
        var dayGapBoundary = emptyDaysBetween >= EmptyDaysThreshold;

        if (previousGps is { } previous && nextGps is { } next)
        {
            // GPS overrules the day-gap verdict either way: it suppresses a
            // day-gap boundary when it's really the same place, and it adds
            // a boundary within a single day when it isn't.
            return DistanceKm(previous, next) > GpsJumpThresholdKm;
        }

        // No GPS on (at least) one side to confirm or suppress with — pure
        // day-based chaining, the "normale weg" per #20 (not a degradation).
        return dayGapBoundary;
    }

    // Haversine, on Earth's mean radius — plenty precise at holiday scale.
    private static double DistanceKm(Coordinate a, Coordinate b)
    {
        const double earthRadiusKm = 6371.0;
        var dLat = ToRadians(b.Lat - a.Lat);
        var dLon = ToRadians(b.Lon - a.Lon);
        var sinLat = Math.Sin(dLat / 2);
        var sinLon = Math.Sin(dLon / 2);
        var h = sinLat * sinLat + Math.Cos(ToRadians(a.Lat)) * Math.Cos(ToRadians(b.Lat)) * sinLon * sinLon;
        return 2 * earthRadiusKm * Math.Asin(Math.Min(1, Math.Sqrt(h)));
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180.0;
}
