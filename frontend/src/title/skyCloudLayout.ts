// How a photographic cloud is piled up from sprites (after spite's
// CSS3DClouds, MIT: see clouds/LICENSE). Pure and seeded, so a given seed is
// always the same cloud.

export type Sprite = {
  /** position and size in px, inside the cloud's w x h footprint */
  left: number
  top: number
  size: number
  rotate: number
  /** the denser texture, for the heavier puffs */
  dark: boolean
  /** a sprite in the lower half: it sits in the cloud's own shadow */
  low: boolean
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Shadowed sprites come first, so the lit ones are painted over them. */
export function layoutSprites(seed: number, count: number, w: number, h: number): Sprite[] {
  const r = rng(seed)
  return Array.from({ length: count }, () => {
    const u = r() + r() - 1 // -1..1, crowded towards the middle
    const v = r() // 0 at the top .. 1 at the bottom
    const size = Math.min(w, h * 1.8) * (0.34 + 0.34 * (1 - Math.abs(u)) * (0.5 + 0.5 * r()))
    return {
      left: w / 2 + u * w * 0.38 - size / 2,
      top: h * (0.15 + v * 0.7) - size / 2,
      size,
      rotate: r() * 360,
      dark: r() < 0.4,
      low: v > 0.5,
      order: r(),
    }
  })
    .sort((a, b) => Number(b.low) - Number(a.low) || a.order - b.order)
    .map(({ order: _order, ...sprite }) => sprite)
}
