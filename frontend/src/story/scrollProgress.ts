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
