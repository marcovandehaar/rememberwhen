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
