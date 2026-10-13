import type { Memory } from '../catalog/types'

export type YearRange = { from: number; to: number }

/** The years the timeline will span, from the catalogue's `date`s (yyyy-mm-dd). */
export function yearRange(memories: Memory[]): YearRange | null {
  if (memories.length === 0) return null
  const years = memories.map((m) => Number(m.date.slice(0, 4)))
  return { from: Math.min(...years), to: Math.max(...years) }
}

/**
 * `count` covers in a random order, so each launch shows different polaroids.
 * With fewer Memories than places the shuffled covers repeat rather than leave gaps.
 */
export function pickCovers(memories: Memory[], count: number, random: () => number = Math.random): string[] {
  const covers = memories.map((m) => m.coverImage)
  if (covers.length === 0) return []

  // Fisher–Yates
  for (let i = covers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[covers[i], covers[j]] = [covers[j], covers[i]]
  }
  return Array.from({ length: count }, (_, i) => covers[i % covers.length])
}
