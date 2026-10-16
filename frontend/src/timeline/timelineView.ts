/**
 * What the timeline remembers while a Story is open on top of it, so back
 * lands on the same year at the same scroll position. App owns one and
 * replaces it with a fresh one on the way back to the title.
 */
export class TimelineView {
  private shown: number | null = null
  private scrolls = new Map<number, number>()
  private settledYears = new Set<number>()

  /** The page last shown; null until the timeline has been opened. */
  get page(): number | null {
    return this.shown
  }
  showPage(page: number) {
    this.shown = page
  }
  scrollOf(year: number): number {
    return this.scrolls.get(year) ?? 0
  }
  setScroll(year: number, top: number) {
    this.scrolls.set(year, top)
  }
  isSettled(year: number): boolean {
    return this.settledYears.has(year)
  }
  markSettled(year: number) {
    this.settledYears.add(year)
  }
}
