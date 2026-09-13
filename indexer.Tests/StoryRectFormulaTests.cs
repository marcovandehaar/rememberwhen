using Indexer.Catalog;

namespace Indexer.Tests;

public class StoryRectFormulaTests
{
    [Fact]
    public void A_4_by_3_source_is_only_zoomed_in_slightly_no_crop_needed()
    {
        var rect = StoryRectFormula.Compute(1600, 1200, itemIndex: 0);

        Assert.Equal(0.9, rect.Width, precision: 10);
        Assert.Equal(0.9, rect.Height, precision: 10);
    }

    [Fact]
    public void A_wide_landscape_source_is_cropped_on_its_left_and_right()
    {
        var rect = StoryRectFormula.Compute(1920, 1080, itemIndex: 0); // 16:9

        Assert.True(rect.Width < 1);
        Assert.True(rect.Height <= 1);
    }

    [Fact]
    public void A_portrait_source_is_cropped_on_its_top_and_bottom()
    {
        var rect = StoryRectFormula.Compute(1200, 1600, itemIndex: 0); // 3:4

        Assert.True(rect.Height < 1);
        Assert.True(rect.Width <= 1);
    }

    [Fact]
    public void Even_items_lean_toward_the_top_left_of_the_crop()
    {
        var even = StoryRectFormula.Compute(1920, 1080, itemIndex: 0);
        var safeCropX = 0.5 * (1 - (4.0 / 3.0) / (1920.0 / 1080.0));

        Assert.Equal(safeCropX, even.X, precision: 10);
        Assert.Equal(0, even.Y, precision: 10);
    }

    [Fact]
    public void Odd_items_lean_toward_the_bottom_right_of_the_crop()
    {
        var even = StoryRectFormula.Compute(1920, 1080, itemIndex: 0);
        var odd = StoryRectFormula.Compute(1920, 1080, itemIndex: 1);

        Assert.True(odd.X > even.X);
        Assert.Equal(even.Width, odd.Width, precision: 10);
    }

    [Fact]
    public void An_extreme_panorama_still_produces_a_valid_fractional_crop()
    {
        var rect = StoryRectFormula.Compute(14745, 2734, itemIndex: 0); // pano_dubrovnik_1.jpg, 5.4:1

        Assert.InRange(rect.Width, 0, 1);
        Assert.InRange(rect.X, 0, 1);
    }
}
