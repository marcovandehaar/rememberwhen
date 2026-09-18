import { expect, test } from 'vitest'
import { buildPlan } from './plan'
import { activeIndex } from './useScrollWindow'
import type { Beat } from './beats'

const rect = { x: 0, y: 0, width: 0.9, height: 0.9 }

function beat(i: number, shotDuration = 4): Beat {
  return { i, chapterStart: null, item: { id: `${i}`, mediaRef: `${i}.jpg`, type: 'photo', capturedAt: null, storyRect: rect, shotDuration } }
}

test('#40: the last beat is active — and so tappable — at the maximum reachable scroll progress', () => {
  const { entries } = buildPlan([beat(0), beat(1), beat(2)])

  expect(activeIndex(entries, 1)).toBe(2)
})

test('the first beat is active at zero scroll', () => {
  const { entries } = buildPlan([beat(0), beat(1), beat(2)])

  expect(activeIndex(entries, 0)).toBe(0)
})

test('a single-beat Story is active across the whole (degenerate) range', () => {
  const { entries } = buildPlan([beat(0)])

  expect(activeIndex(entries, 0)).toBe(0)
  expect(activeIndex(entries, 1)).toBe(0)
})
