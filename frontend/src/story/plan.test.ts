import { expect, test } from 'vitest'
import { buildPlan, chapterTicks } from './plan'
import type { Beat } from './beats'
import type { Chapter } from '../catalog/types'

const rect = { x: 0, y: 0, width: 0.9, height: 0.9 }
const chapter = (id: string): Chapter => ({ id, location: null, mediaItems: [] })

function beat(i: number, shotDuration: number, chapterStart: Chapter | null = null): Beat {
  return { i, chapterStart, item: { id: `${i}`, mediaRef: `${i}.jpg`, type: 'photo', capturedAt: null, storyRect: rect, shotDuration } }
}

test('equal shotDurations reproduce the original fixed cadence', () => {
  const { entries, totalUnits } = buildPlan([beat(0, 4), beat(1, 4), beat(2, 4)])
  // 3 items, 4s each (1.0 viewport slot), 0.75 overlap step, +1 trailing
  // room for the last item's fade-in (#40) -> totalUnits = 2*0.75 + 1 + 1 = 3.5
  expect(totalUnits).toBeCloseTo(3.5, 10)
  expect(entries[0].start).toBe(0)
  expect(entries[1].start).toBeCloseTo(0.75 / 2.5, 10) // scrollable = totalUnits - 1 = 2.5
})

test('#40: the last entry ends at exactly the reachable maximum, giving its fade-in room to complete', () => {
  const { entries } = buildPlan([beat(0, 4), beat(1, 4), beat(2, 4)])
  // Symmetric to entries[0].start === 0: the last entry's *end* now lands
  // exactly on global progress 1, mirroring how the first entry starts
  // exactly on 0 — both are then trivially reachable by scrolling.
  expect(entries[2].end).toBeCloseTo(1, 10)
  // With real margin below 1, not flush against it — that flush-ness was
  // the original bug (zero tolerance for any scroll-position rounding).
  expect(entries[2].start).toBeLessThan(0.9)
})

test('a longer shotDuration claims more scroll distance than a shorter one', () => {
  const { entries } = buildPlan([beat(0, 4), beat(1, 12), beat(2, 4)])
  const slot1 = entries[1].end - entries[1].start
  const slot0 = entries[0].end - entries[0].start
  expect(slot1).toBeGreaterThan(slot0)
})

test('the first and last entries are flagged', () => {
  const { entries } = buildPlan([beat(0, 4), beat(1, 4), beat(2, 4)])
  expect(entries[0].first).toBe(true)
  expect(entries[2].last).toBe(true)
  expect(entries[1].first).toBe(false)
  expect(entries[1].last).toBe(false)
})

test('a single item does not divide by zero', () => {
  const { entries } = buildPlan([beat(0, 4)])
  expect(entries[0].start).toBe(0)
  expect(entries[0].end).toBe(1)
  expect(Number.isFinite(entries[0].start)).toBe(true)
})

test('an empty list produces no entries', () => {
  const { entries, totalUnits } = buildPlan([])
  expect(entries).toEqual([])
  expect(totalUnits).toBe(0)
})

test('chapterTicks: one tick per chapter, at that chapter\'s own start fraction', () => {
  const { entries } = buildPlan([
    beat(0, 4, chapter('c1')),
    beat(1, 4),
    beat(2, 4, chapter('c2')),
    beat(3, 4),
  ])

  expect(chapterTicks(entries)).toEqual([entries[0].start, entries[2].start])
})

test('chapterTicks: a single-chapter Memory produces exactly one tick, at 0', () => {
  const { entries } = buildPlan([beat(0, 4, chapter('c1')), beat(1, 4), beat(2, 4)])

  expect(chapterTicks(entries)).toEqual([0])
})

test('chapterTicks: no entries produces no ticks', () => {
  expect(chapterTicks([])).toEqual([])
})
