using Indexer;
using Indexer.Catalog;

namespace Indexer.Tests;

public class ChapterBoundariesTests
{
    private static readonly Coordinate Origin = new(0, 0);
    private static readonly Coordinate NearOrigin = new(0.02, 0); // ~2.2 km away
    private static readonly Coordinate FarFromOrigin = new(0.1, 0); // ~11.1 km away

    private static DateTimeOffset Day(int day) => new(2016, 7, day, 9, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Same_day_without_gps_is_not_a_boundary()
    {
        Assert.False(ChapterBoundaries.IsBoundary(Day(1), null, Day(1), null));
    }

    [Fact]
    public void Consecutive_days_without_gps_is_not_a_boundary()
    {
        Assert.False(ChapterBoundaries.IsBoundary(Day(1), null, Day(2), null));
    }

    [Fact]
    public void One_empty_day_between_is_not_yet_a_boundary()
    {
        // Photos on day 1 and day 3 — day 2 is empty, but that's only one
        // empty day, and the heuristic requires two consecutive ones (#20).
        Assert.False(ChapterBoundaries.IsBoundary(Day(1), null, Day(3), null));
    }

    [Fact]
    public void Two_empty_days_between_is_a_boundary()
    {
        Assert.True(ChapterBoundaries.IsBoundary(Day(1), null, Day(4), null));
    }

    [Fact]
    public void A_day_gap_boundary_is_suppressed_when_gps_shows_the_same_place()
    {
        Assert.False(ChapterBoundaries.IsBoundary(Day(1), Origin, Day(4), NearOrigin));
    }

    [Fact]
    public void A_day_gap_boundary_survives_when_gps_shows_a_different_place()
    {
        Assert.True(ChapterBoundaries.IsBoundary(Day(1), Origin, Day(4), FarFromOrigin));
    }

    [Fact]
    public void A_gps_jump_adds_a_boundary_within_a_single_day()
    {
        Assert.True(ChapterBoundaries.IsBoundary(Day(1), Origin, Day(1), FarFromOrigin));
    }

    [Fact]
    public void A_small_gps_move_within_a_single_day_is_not_a_boundary()
    {
        Assert.False(ChapterBoundaries.IsBoundary(Day(1), Origin, Day(1), NearOrigin));
    }

    [Fact]
    public void A_day_gap_without_gps_on_either_side_defaults_to_a_boundary()
    {
        // No location evidence to suppress it with — falls back to pure
        // day-based chaining, per #20.
        Assert.True(ChapterBoundaries.IsBoundary(Day(1), null, Day(4), FarFromOrigin));
        Assert.True(ChapterBoundaries.IsBoundary(Day(1), Origin, Day(4), null));
    }
}
