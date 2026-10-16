import { expect, test } from 'vitest'
import { layoutSprites } from './skyCloudLayout'

test('a seed always gives the same cloud', () => {
  expect(layoutSprites(7, 12, 500, 300)).toEqual(layoutSprites(7, 12, 500, 300))
})

test('different seeds give different clouds', () => {
  expect(layoutSprites(7, 12, 500, 300)).not.toEqual(layoutSprites(8, 12, 500, 300))
})

test('a cloud has as many sprites as asked for', () => {
  expect(layoutSprites(1, 9, 500, 300)).toHaveLength(9)
})

test('the shadowed sprites are painted first, so the lit ones sit on top', () => {
  const lows = layoutSprites(3, 20, 500, 300).map((s) => s.low)

  expect(lows).toEqual([...lows].sort((a, b) => Number(b) - Number(a)))
})

test('the sprites stay around the cloud, none flung far outside its footprint', () => {
  for (const s of layoutSprites(5, 30, 600, 300)) {
    expect(s.left + s.size / 2).toBeGreaterThan(0)
    expect(s.left + s.size / 2).toBeLessThan(600)
  }
})
