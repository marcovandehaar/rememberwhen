import type { Memory } from '../catalog/types'

export type YearPage = { year: number; memories: Memory[] }

/** One page per year that has Memories, oldest year first; within a year, oldest Memory first. */
export function groupByYear(memories: Memory[]): YearPage[] {
  const byYear = new Map<number, Memory[]>()
  for (const m of memories) {
    const year = Number(m.date.slice(0, 4))
    byYear.set(year, [...(byYear.get(year) ?? []), m])
  }
  return [...byYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      memories: byYear.get(year)!.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name)),
    }))
}

/** The pin thumbnail is far too small for a polaroid: use the mid-size cover, or until it exists the cover's Story rendition. */
export function polaroidCover(m: Memory): string {
  return m.coverPhoto ?? m.coverImage.replace(/-thumb\.jpg$/, '-story.jpg')
}

const DAY_MONTH = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' })

/** "14 mei" for a yyyy-mm-dd date; the year is already on the page. */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return DAY_MONTH.format(new Date(y, m - 1, d))
}

/** The bottom fade covers this much of the page, so a polaroid under it is not yet "seen". */
const FADE = 60

/** How many polaroids still sit (more than ~half) below the visible part of the page. */
export function remainingBelow(rows: { top: number; height: number }[], scrollTop: number, clientHeight: number): number {
  const fold = scrollTop + clientHeight - FADE
  return rows.filter((r) => r.top + r.height * 0.55 > fold).length
}
