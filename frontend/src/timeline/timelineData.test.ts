import { expect, test } from 'vitest'
import { dateLabel, groupByYear, polaroidCover, remainingBelow } from './timelineData'
import type { Memory } from '../catalog/types'

function memory(id: string, date: string, extra: Partial<Memory> = {}): Memory {
  return { id, name: id, destination: null, date, coverImage: `${id}-thumb.jpg`, chapters: [], ...extra }
}

test('Memories are grouped under the year of their date, oldest year first', () => {
  const pages = groupByYear([memory('a', '2024-03-01'), memory('b', '2019-07-01'), memory('c', '2024-05-01')])

  expect(pages.map((p) => p.year)).toEqual([2019, 2024])
  expect(pages[1].memories.map((m) => m.id)).toEqual(['a', 'c'])
})

test('within a year the Memories run from oldest to newest', () => {
  const [page] = groupByYear([memory('late', '2022-11-30'), memory('early', '2022-01-02'), memory('mid', '2022-06-15')])

  expect(page.memories.map((m) => m.id)).toEqual(['early', 'mid', 'late'])
})

test('years without Memories get no page', () => {
  const pages = groupByYear([memory('a', '2015-01-01'), memory('b', '2020-01-01')])

  expect(pages.map((p) => p.year)).toEqual([2015, 2020])
})

test('without Memories there are no pages', () => {
  expect(groupByYear([])).toEqual([])
})

test('the polaroid shows the mid-size cover when the Memory has one', () => {
  expect(polaroidCover(memory('a', '2020-01-01', { coverPhoto: 'a-cover.jpg' }))).toBe('a-cover.jpg')
})

test('until the mid-size cover exists, the polaroid falls back to the cover\'s Story rendition', () => {
  expect(polaroidCover(memory('a', '2020-01-01', { coverPhoto: null }))).toBe('a-story.jpg')
  expect(polaroidCover(memory('b', '2020-01-01'))).toBe('b-story.jpg')
})

test('the date under a polaroid is the day and month, in Dutch', () => {
  expect(dateLabel('2023-05-14')).toBe('14 mei')
  expect(dateLabel('2021-09-01')).toBe('1 september')
})

test('"nog N" counts the polaroids that are still (mostly) below the fold', () => {
  const rows = [
    { top: 0, height: 300 },
    { top: 340, height: 300 },
    { top: 680, height: 300 },
    { top: 1020, height: 300 },
  ]

  // a 700px-tall page scrolled to the top, minus the 60px the fade covers
  expect(remainingBelow(rows, 0, 700)).toBe(2)
  expect(remainingBelow(rows, 400, 700)).toBe(1)
})

test('"nog N" is gone at the end of the year', () => {
  const rows = [
    { top: 0, height: 300 },
    { top: 340, height: 300 },
  ]

  expect(remainingBelow(rows, 0, 700)).toBe(0)
})
