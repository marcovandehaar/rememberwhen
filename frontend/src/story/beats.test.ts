import { expect, test } from 'vitest'
import { beats } from './beats'
import type { Memory } from '../catalog/types'

const rect = { x: 0, y: 0, width: 0.9, height: 0.9 }

function item(id: string, capturedAt: string | null) {
  return { id, mediaRef: `${id}.jpg`, type: 'photo' as const, capturedAt, storyRect: rect, shotDuration: 4 }
}

const memory: Memory = {
  id: 'zeeland-2016',
  name: 'Zeeland 2016',
  destinationName: 'Zeeland',
  destinationCoordinate: { lat: 51.5, lon: 3.8 },
  coverImage: 'cover.jpg',
  chapters: [
    {
      id: 'c1',
      location: null,
      mediaItems: [item('a', '2016-07-01T08:00:00+02:00'), item('b', '2016-07-01T09:00:00+02:00')],
    },
    {
      id: 'c2',
      location: null,
      mediaItems: [item('c', '2016-07-02T14:00:00+02:00')],
    },
  ],
}

test('flattens chapters into a single sequential list', () => {
  const list = beats(memory)
  expect(list.map((b) => b.item.id)).toEqual(['a', 'b', 'c'])
  expect(list.map((b) => b.i)).toEqual([0, 1, 2])
})

test('marks only the first item of each chapter as a chapter start', () => {
  const list = beats(memory)
  expect(list[0].chapterStart?.id).toBe('c1')
  expect(list[1].chapterStart).toBeNull()
  expect(list[2].chapterStart?.id).toBe('c2')
})
