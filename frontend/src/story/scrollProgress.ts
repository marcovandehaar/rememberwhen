/** Scroll position as a 0..1 fraction of the scrollable distance. */
export function scrollProgress(): number {
  const max = document.documentElement.scrollHeight - window.innerHeight
  return max > 0 ? window.scrollY / max : 0
}
