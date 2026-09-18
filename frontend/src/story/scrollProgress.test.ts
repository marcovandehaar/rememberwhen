import { afterEach, expect, test, vi } from 'vitest'
import { scrollProgress } from './scrollProgress'

function stub(scrollHeight: number, innerHeight: number, scrollY: number) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: scrollHeight, configurable: true })
  vi.stubGlobal('innerHeight', innerHeight)
  vi.stubGlobal('scrollY', scrollY)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('reports 0 at the top', () => {
  stub(2000, 800, 0)
  expect(scrollProgress()).toBe(0)
})

test('reports 1 when scrollY exactly reaches the max', () => {
  stub(2000, 800, 1200)
  expect(scrollProgress()).toBe(1)
})

test('#40: reports 1 even when scrollY falls a sub-pixel short of the max, so the last Media Item stays reachable', () => {
  stub(1913, 765, 1147.5) // the exact figures observed live: max = 1913 - 765 = 1148
  expect(scrollProgress()).toBe(1)
})

test('does not snap to 1 when meaningfully short of the max', () => {
  stub(2000, 800, 900)
  expect(scrollProgress()).toBeCloseTo(0.75, 10)
})

test('reports 0 when the page is not scrollable at all', () => {
  stub(800, 800, 0)
  expect(scrollProgress()).toBe(0)
})
