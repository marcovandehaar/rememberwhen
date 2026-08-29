import raw from '../chapter.json'

// One real day out of Wintersport Zillertal 2024 — 20 February, 08:48 to 17:04.
// Chosen on actual capture times (Windows Shell property 12 for photos, 215 for
// videos), not on filename order: the file numbers run straight through the
// nights, so a filename range would have straddled two days.

export type Item = {
  id: string
  src: string
  kind: 'photo' | 'video'
  /** Capture time, HH:mm. Real. */
  taken: string
  w: number
  h: number
  portrait: boolean
}

export type Chapter = {
  title: string
  /** HH:mm of the first and last item. */
  from: string
  to: string
  items: Item[]
}

const ALL: Item[] = (raw as { file: string; kind: string; taken: string; w: number; h: number }[]).map((r) => ({
  id: r.file,
  src: `/media/${r.file}`,
  kind: r.kind === 'video' ? 'video' : 'photo',
  taken: r.taken,
  w: r.w,
  h: r.h,
  portrait: r.h > r.w,
}))

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Split the day into two Chapters at its largest internal gap.
 *
 * PROTOTYPE CONVENIENCE, and worth being honest about: `CONTEXT.md` defines a
 * Chapter as "one continuous stay in one place", so a lunch break does not
 * really start a new Chapter. But the prototype has to show a Chapter
 * transition, and this is the only real boundary in a single day's media.
 */
export function chapters(): Chapter[] {
  let splitAt = 1
  let biggest = 0
  for (let i = 1; i < ALL.length; i++) {
    const gap = minutes(ALL[i].taken) - minutes(ALL[i - 1].taken)
    if (gap > biggest) {
      biggest = gap
      splitAt = i
    }
  }
  const a = ALL.slice(0, splitAt)
  const b = ALL.slice(splitAt)
  return [
    { title: 'De piste op', from: a[0].taken, to: a[a.length - 1].taken, items: a },
    { title: 'Na de lunch', from: b[0].taken, to: b[b.length - 1].taken, items: b },
  ]
}

export const MEMORY_TITLE = 'Wintersport Zillertal'
export const MEMORY_SUBTITLE = '20 februari 2024'

/** A flat list with chapter boundaries marked, which is what the renderers want. */
export type Beat = {
  item: Item
  /** Index across the whole story. */
  i: number
  /** True on the first item of a Chapter. */
  chapterStart: Chapter | null
}

export function beats(): Beat[] {
  const out: Beat[] = []
  let i = 0
  for (const ch of chapters()) {
    ch.items.forEach((item, k) => {
      out.push({ item, i: i++, chapterStart: k === 0 ? ch : null })
    })
  }
  return out
}

/**
 * Formulaic Ken Burns, no image analysis — deliberate, per the renderer
 * decision (#12). Alternating direction so consecutive shots do not drift the
 * same way, slight zoom in, and portraits pan vertically where landscapes pan
 * horizontally, because that is where their spare pixels are.
 */
export function kenBurns(b: Beat): { from: string; to: string } {
  const dir = b.i % 2 === 0 ? 1 : -1
  const pan = b.item.portrait ? `0% ${dir * 4}%` : `${dir * 5}% 0%`
  const back = b.item.portrait ? `0% ${-dir * 3}%` : `${-dir * 4}% 0%`
  return {
    from: `translate(${back}) scale(1.06)`,
    to: `translate(${pan}) scale(1.16)`,
  }
}
