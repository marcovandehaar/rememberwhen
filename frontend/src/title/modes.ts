export type Mode = 'globe' | 'timeline'

/** The colour each mode grows out of (and fades back into) on the way in and out. */
export const MODE_BG: Record<Mode, string> = { globe: '#04070f', timeline: '#f3ebdd' }

export const SF = '-apple-system, "SF Pro Display", BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif'
