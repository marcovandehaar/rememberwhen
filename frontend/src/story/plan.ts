import type { Beat } from './beats'

// A photo's default 4s shotDuration maps to exactly one viewport of scroll —
// matching the fixed cadence before shotDuration existed as a catalog field.
// A longer shotDuration (typically a video, once #35 wires it up) claims
// more scroll distance, proportionally.
const SECONDS_PER_VIEWPORT = 4
const OVERLAP_RATIO = 0.75 // how much of a shot's own slot overlaps the next

export type PlanEntry = {
  b: Beat
  start: number // fraction (0..1) of the scrollable distance
  end: number
  first: boolean
  last: boolean
}

export function buildPlan(list: Beat[]): { totalUnits: number; entries: PlanEntry[] } {
  const slots = list.map((b) => b.item.shotDuration / SECONDS_PER_VIEWPORT)
  const steps = slots.map((slot) => slot * OVERLAP_RATIO)

  const positions: number[] = []
  let cursor = 0
  for (let i = 0; i < list.length; i++) {
    positions.push(cursor)
    cursor += steps[i]
  }

  const totalUnits = list.length === 0 ? 0 : positions[positions.length - 1] + slots[slots.length - 1]
  const scrollable = totalUnits - 1

  const entries: PlanEntry[] = list.map((b, i) => {
    const first = i === 0
    const last = i === list.length - 1
    if (scrollable <= 0) return { b, start: 0, end: 1, first, last }
    return {
      b,
      start: positions[i] / scrollable,
      end: (positions[i] + slots[i]) / scrollable,
      first,
      last,
    }
  })

  return { totalUnits, entries }
}
