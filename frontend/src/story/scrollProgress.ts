/** Scroll position as a 0..1 fraction of the scrollable distance. */
export function scrollProgress(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight
  if (max <= 0) return 0
  // A browser clamps scrollY to an integer pixel, while `max` can carry
  // sub-pixel rounding from layout (`plan.ts`'s totalUnits * 100svh) — fully
  // scrolled to the bottom rarely lands on exactly `max`. plan.ts gives the
  // last Media Item's activation window a start of exactly 1, so anything
  // short of that left it permanently untappable (#40).
  return window.scrollY >= max - 1 ? 1 : window.scrollY / max
}

/**
 * The inverse of scrollProgress(): jumps straight to a 0..1 fraction of the
 * scrollable distance. ScrubBar (#50) calls this on every drag frame — the
 * two-argument form of scrollTo is always instant, never animated, so a
 * fast drag never lags behind the finger, and both of the Story's rendering
 * paths (CSS scroll-timeline and the JS rAF fallback) pick it up identically
 * since they both only ever read window.scrollY.
 */
export function setScrollProgress(fraction: number): void {
  const max = document.documentElement.scrollHeight - window.innerHeight
  if (max <= 0) return
  const clamped = Math.min(1, Math.max(0, fraction))
  window.scrollTo(0, clamped * max)
}
