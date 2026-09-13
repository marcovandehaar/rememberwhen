import type { Chapter, MediaItem, Memory } from '../catalog/types'

export type Beat = {
  item: MediaItem
  /** Index across the whole Story. */
  i: number
  /** Set on the first Media Item of a Chapter. */
  chapterStart: Chapter | null
}

export function beats(memory: Memory): Beat[] {
  const out: Beat[] = []
  let i = 0
  for (const chapter of memory.chapters) {
    chapter.mediaItems.forEach((item, k) => {
      out.push({ item, i: i++, chapterStart: k === 0 ? chapter : null })
    })
  }
  return out
}

/** HH:mm from the first and last item's capturedAt in a Chapter, for the title card. */
export function chapterTimeRange(chapter: Chapter): string | null {
  const times = chapter.mediaItems
    .map((m) => m.capturedAt)
    .filter((t): t is string => t !== null)
    .map((t) => new Date(t))
  if (times.length === 0) return null

  const fmt = (d: Date) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${fmt(times[0])} – ${fmt(times[times.length - 1])}`
}
