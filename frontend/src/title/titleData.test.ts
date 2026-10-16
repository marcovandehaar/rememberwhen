import { expect, test } from 'vitest'
import { pickCovers, yearRange } from './titleData'
import type { Memory } from '../catalog/types'

function memory(id: string, date: string): Memory {
  return { id, name: id, destination: null, date, coverImage: `${id}.jpg`, chapters: [] }
}

test('the year range spans the earliest and the latest Memory date', () => {
  const memories = [memory('a', '2016-07-01'), memory('b', '2024-01-05'), memory('c', '2010-12-31')]

  expect(yearRange(memories)).toEqual({ from: 2010, to: 2024 })
})

test('there is no year range without Memories', () => {
  expect(yearRange([])).toBeNull()
})

test('a random selection of covers has the requested size and holds only real covers', () => {
  const memories = ['a', 'b', 'c', 'd', 'e'].map((id) => memory(id, '2020-01-01'))

  const covers = pickCovers(memories, 3)

  expect(covers).toHaveLength(3)
  expect(new Set(covers).size).toBe(3)
  for (const cover of covers) expect(memories.map((m) => m.coverImage)).toContain(cover)
})

test('the selection follows the random source', () => {
  const memories = ['a', 'b', 'c'].map((id) => memory(id, '2020-01-01'))

  const first = pickCovers(memories, 3, () => 0)
  const last = pickCovers(memories, 3, () => 0.999)

  expect(first).not.toEqual(last)
})

test('fewer covers than places repeat from the start instead of leaving gaps', () => {
  const memories = [memory('a', '2020-01-01'), memory('b', '2020-01-01')]

  const covers = pickCovers(memories, 5)

  expect(covers).toHaveLength(5)
  expect(covers.slice(2, 4)).toEqual(covers.slice(0, 2))
})

test('without Memories there are no covers to show', () => {
  expect(pickCovers([], 4)).toEqual([])
})

test('a Memory with a mid-size cover shows that one instead of its pin thumbnail', () => {
  const sharp = { ...memory('a', '2020-01-01'), coverPhoto: 'a-cover.jpg' }
  const old = memory('b', '2020-01-01')

  const covers = pickCovers([sharp, old], 2)

  expect([...covers].sort()).toEqual(['a-cover.jpg', 'b.jpg'])
})
