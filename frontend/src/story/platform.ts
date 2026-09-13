// Scroll IS the timeline (ADR 0001). Two paths reach the same curves:
//   CSS — animation-timeline: scroll(root block), zero JS in the animation
//         loop. Shipped in Safari 26.0.
//   rAF — the same curves interpolated by hand, for the household's 2019
//         iPad, which reports scroll-timeline: NO and shows a black screen
//         without this path (ADR 0001 amendment).
// ?mode=js forces the fallback for testing on hardware that does support
// the platform path.
const PLATFORM_SUPPORTS =
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline: scroll(root block)') &&
  CSS.supports('animation-range: 10% 20%')
const FORCED = new URLSearchParams(location.search).get('mode')
export const HAS_SCROLL_TIMELINE = FORCED === 'js' ? false : PLATFORM_SUPPORTS
