import type { Memory } from '../catalog/types'
import type { Mode } from '../title/modes'

const FULL_DATE = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

/** The small line above a Story's name: where a Trip went, or when a Memory that isn't a Trip happened. */
export function titleLabel(memory: Memory): string {
  if (memory.destination) return memory.destination.name
  const [y, m, d] = memory.date.split('-').map(Number)
  return FULL_DATE.format(new Date(y, m - 1, d))
}

/** What the Story's back button tells a screen reader: the mode it returns to. */
export function backLabel(mode: Mode): string {
  return mode === 'globe' ? 'Terug naar de globe' : 'Terug naar de tijdlijn'
}
