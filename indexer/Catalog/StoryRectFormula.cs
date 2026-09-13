namespace Indexer.Catalog;

// v1's formulaic Ken Burns framing (#12: "alternating direction, slight
// zoom, portrait and landscape handled differently"). The renderer animates
// from the full frame toward this rect, so storyRect is the zoomed-in
// destination, not a static crop:
//   1. The largest centered crop matching the household iPad's own landscape
//      aspect (1080:810 = 4:3, #25) — this is what differs between portrait
//      and landscape sources.
//   2. A further 10% zoom-in within that crop ("slight zoom").
//   3. The zoomed rect leans toward alternating corners by item index
//      ("alternating direction") rather than staying centered.
// Saliency-driven framing is a later recomputation of this same field, never
// a re-index (#12).
public static class StoryRectFormula
{
    private const double TargetAspect = 4.0 / 3.0;
    private const double ZoomFactor = 0.9;

    public static StoryRect Compute(int width, int height, int itemIndex)
    {
        var (x0, y0, w0, h0) = SafeCrop(width, height);

        var zoomedWidth = w0 * ZoomFactor;
        var zoomedHeight = h0 * ZoomFactor;
        var slackX = w0 - zoomedWidth;
        var slackY = h0 - zoomedHeight;

        // Even items lean toward the crop's top-left, odd items its bottom-right.
        var leanTopLeft = itemIndex % 2 == 0;
        var x = x0 + (leanTopLeft ? 0 : slackX);
        var y = y0 + (leanTopLeft ? 0 : slackY);

        return new StoryRect(x, y, zoomedWidth, zoomedHeight);
    }

    private static (double X, double Y, double Width, double Height) SafeCrop(int width, int height)
    {
        var sourceAspect = (double)width / height;

        if (sourceAspect > TargetAspect)
        {
            var cropWidthFraction = TargetAspect / sourceAspect;
            var x = (1 - cropWidthFraction) / 2;
            return (x, 0, cropWidthFraction, 1);
        }

        var cropHeightFraction = sourceAspect / TargetAspect;
        var yInset = (1 - cropHeightFraction) / 2;
        return (0, yInset, 1, cropHeightFraction);
    }
}
