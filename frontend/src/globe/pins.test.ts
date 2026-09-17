import { expect, test } from 'vitest'
import { latestCapturedAt, pinsFor } from './pins'
import type { Memory } from '../catalog/types'

function memory(overrides: Partial<Memory> & Pick<Memory, 'id' | 'destinationName' | 'coverImage'>): Memory {
  return {
    name: overrides.id,
    destinationCoordinate: { lat: 51.5, lon: 3.8 },
    chapters: [],
    ...overrides,
  }
}

function itemAt(capturedAt: string | null) {
  return { id: 'x', mediaRef: 'x.jpg', type: 'photo' as const, capturedAt, storyRect: { x: 0, y: 0, width: 1, height: 1 }, shotDuration: 4 }
}

test('two Memories with different Destinations produce two separate pins', () => {
  const a = memory({ id: 'a', destinationName: 'Zeeland', coverImage: 'a.jpg' })
  const b = memory({ id: 'b', destinationName: 'Zillertal', coverImage: 'b.jpg', destinationCoordinate: { lat: 47, lon: 12 } })

  const pins = pinsFor([a, b])

  expect(pins).toHaveLength(2)
  expect(pins.map((p) => p.destinationName).sort()).toEqual(['Zeeland', 'Zillertal'])
})

test('two Memories with the same Destination collapse into one pin, covered by the newest', () => {
  const older = memory({
    id: 'krieghuusbelten-2022',
    destinationName: 'Raalte',
    coverImage: 'older.jpg',
    chapters: [{ id: 'c1', location: null, mediaItems: [itemAt('2022-07-01T09:00:00+02:00')] }],
  })
  const newer = memory({
    id: 'krieghuusbelten-2024',
    destinationName: 'Raalte',
    coverImage: 'newer.jpg',
    chapters: [{ id: 'c1', location: null, mediaItems: [itemAt('2024-07-01T09:00:00+02:00')] }],
  })

  // Order in the catalogue shouldn't matter, so check both.
  for (const memories of [[older, newer], [newer, older]]) {
    const pins = pinsFor(memories)
    expect(pins).toHaveLength(1)
    expect(pins[0].cover).toBe('newer.jpg')
    expect(pins[0].memories).toHaveLength(2)
  }
})

test('a Memory with no capture times anywhere never wins "newest" over one that has any', () => {
  const noDates = memory({ id: 'no-dates', destinationName: 'Raalte', coverImage: 'no-dates.jpg' })
  const dated = memory({
    id: 'dated',
    destinationName: 'Raalte',
    coverImage: 'dated.jpg',
    chapters: [{ id: 'c1', location: null, mediaItems: [itemAt('2024-01-01T00:00:00+01:00')] }],
  })

  expect(pinsFor([noDates, dated])[0].cover).toBe('dated.jpg')
  expect(pinsFor([dated, noDates])[0].cover).toBe('dated.jpg')
})

test('latestCapturedAt ignores items without a capture time', () => {
  const m = memory({
    id: 'a',
    destinationName: 'Zeeland',
    coverImage: 'a.jpg',
    chapters: [
      { id: 'c1', location: null, mediaItems: [itemAt(null), itemAt('2016-07-01T08:00:00+02:00')] },
      { id: 'c2', location: null, mediaItems: [itemAt('2016-07-03T08:00:00+02:00'), itemAt(null)] },
    ],
  })

  expect(latestCapturedAt(m)).toBe(new Date('2016-07-03T08:00:00+02:00').getTime())
})

test('a Memory with no capture times at all reports -Infinity', () => {
  expect(latestCapturedAt(memory({ id: 'a', destinationName: 'Zeeland', coverImage: 'a.jpg' }))).toBe(-Infinity)
})
