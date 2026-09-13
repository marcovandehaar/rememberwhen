import { expect, test } from 'vitest'
import { buildPlan } from './plan'
import type { Beat } from './beats'

const rect = { x: 0, y: 0, width: 0.9, height: 0.9 }

function beat(i: number, shotDuration: number): Beat {
  return { i, chapterStart: null, item: { id: `${i}`, mediaRef: `${i}.jpg`, type: 'photo', capturedAt: null, storyRect: rect, shotDuration } }
}

test('equal shotDurations reproduce the original fixed cadence', () => {
  const { entries, totalUnits } = buildPlan([beat(0, 4), beat(1, 4), beat(2, 4)])
  // 3 items, 4s each (1.0 viewport slot), 0.75 overlap step -> totalUnits = 2*0.75 + 1 = 2.5
  expect(totalUnits).toBeCloseTo(2.5, 10)
  expect(entries[0].start).toBe(0)
  expect(entries[1].start).toBeCloseTo(0.75 / 1.5, 10) // scrollable = totalUnits - 1 = 1.5
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
