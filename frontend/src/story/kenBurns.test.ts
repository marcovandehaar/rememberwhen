import { expect, test } from 'vitest'
import { kenBurnsTransform, opacityAt } from './kenBurns'

const FOUR_THIRDS = 4 / 3

function scaleAndTranslate(transform: string) {
  const scale = Number(/scale\(([^)]+)\)/.exec(transform)?.[1])
  const [tx, ty] = /translate\(([^,]+)%,\s*([^)]+)%\)/
    .exec(transform)!
    .slice(1)
    .map(Number)
  return { scale, tx, ty }
}

test('a 4:3 source in a 4:3 container needs no crop, so p=0 starts at identity', () => {
  const rect = { x: 0, y: 0, width: 0.9, height: 0.9 }
  const start = scaleAndTranslate(kenBurnsTransform(rect, 1600, 1200, FOUR_THIRDS, 0))
  expect(start.scale).toBe(1)
  expect(start.tx).toBe(0)
  expect(start.ty).toBe(0)
})

test('at p=1 a centered target rect needs no translate, just the zoom', () => {
  const rect = { x: 0.05, y: 0.05, width: 0.9, height: 0.9 } // centered within the 0..1 crop
  const end = scaleAndTranslate(kenBurnsTransform(rect, 1600, 1200, FOUR_THIRDS, 1))
  expect(end.scale).toBeCloseTo(1 / 0.9, 5)
  expect(end.tx).toBeCloseTo(0, 5)
  expect(end.ty).toBeCloseTo(0, 5)
})

test('at p=1 a rect leaning top-left shifts the translate toward that corner', () => {
  const rect = { x: 0, y: 0, width: 0.9, height: 0.9 }
  const end = scaleAndTranslate(kenBurnsTransform(rect, 1600, 1200, FOUR_THIRDS, 1))
  expect(end.scale).toBeCloseTo(1 / 0.9, 5)
  expect(end.tx).toBeGreaterThan(0)
  expect(end.ty).toBeGreaterThan(0)
})

test('a landscape source cropped for a wide storyRect lean produces a translate at p=1', () => {
  // 1920x1080, safe crop x0=0.125,w0=0.75; rect leans bottom-right (matches Indexer output)
  const rect = { x: 0.2, y: 0.1, width: 0.675, height: 0.9 }
  const end = scaleAndTranslate(kenBurnsTransform(rect, 1920, 1080, FOUR_THIRDS, 1))
  expect(end.scale).toBeCloseTo(1 / 0.9, 5)
  expect(end.tx).toBeLessThan(0)
  expect(end.ty).toBeLessThan(0)
})

test('interpolates smoothly between p=0 and p=1', () => {
  const rect = { x: 0.2, y: 0.1, width: 0.675, height: 0.9 }
  const mid = scaleAndTranslate(kenBurnsTransform(rect, 1920, 1080, FOUR_THIRDS, 0.5))
  const start = scaleAndTranslate(kenBurnsTransform(rect, 1920, 1080, FOUR_THIRDS, 0))
  const end = scaleAndTranslate(kenBurnsTransform(rect, 1920, 1080, FOUR_THIRDS, 1))
  expect(mid.scale).toBeCloseTo((start.scale + end.scale) / 2, 5)
})

test('the same storyRect produces a different transform in a differently-shaped container', () => {
  const rect = { x: 0.2, y: 0.1, width: 0.675, height: 0.9 }
  const asFourThree = kenBurnsTransform(rect, 1920, 1080, FOUR_THIRDS, 1)
  const asSixteenNine = kenBurnsTransform(rect, 1920, 1080, 16 / 9, 1)
  expect(asFourThree).not.toBe(asSixteenNine)
})

test('never zooms out past the base frame, even for a storyRect the container aspect cannot fit', () => {
  const rect = { x: 0, y: 0, width: 0.9, height: 0.9 }
  // An extreme container aspect makes the safe crop for this source much
  // narrower than storyRect, which would otherwise imply scale < 1.
  const end = scaleAndTranslate(kenBurnsTransform(rect, 1920, 1080, 5, 1))
  expect(end.scale).toBeGreaterThanOrEqual(1)
})

test('degrades to identity rather than NaN when the image has no size yet', () => {
  const rect = { x: 0, y: 0, width: 0.9, height: 0.9 }
  const transform = kenBurnsTransform(rect, 0, 0, FOUR_THIRDS, 0.5)
  expect(transform).toBe('scale(1) translate(0%, 0%)')
})

test('opacity holds at 1 in the middle of the range', () => {
  expect(opacityAt(0.5, false, false)).toBe(1)
})

test('opacity fades in from 0 unless it is the first item', () => {
  expect(opacityAt(0, false, false)).toBe(0)
  expect(opacityAt(0, true, false)).toBe(1)
})

test('opacity fades out to 0 unless it is the last item', () => {
  expect(opacityAt(1, false, false)).toBe(0)
  expect(opacityAt(1, false, true)).toBe(1)
})
