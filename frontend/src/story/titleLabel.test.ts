import { expect, test } from 'vitest'
import { backLabel, titleLabel } from './titleLabel'
import type { Memory } from '../catalog/types'

function memory(extra: Partial<Memory> = {}): Memory {
  return { id: 'a', name: 'A', destination: null, date: '2023-05-14', coverImage: 'a.jpg', chapters: [], ...extra }
}

test('a Trip\'s Story is labelled with its Destination', () => {
  const trip = memory({ destination: { name: 'Zeeland', coordinate: { lat: 51.5, lon: 3.8 } } })

  expect(titleLabel(trip)).toBe('Zeeland')
})

test('a Memory that is not a Trip is labelled with its date, in Dutch', () => {
  expect(titleLabel(memory({ date: '2023-05-14' }))).toBe('14 mei 2023')
  expect(titleLabel(memory({ date: '2021-09-01' }))).toBe('1 september 2021')
})

test('the back button says where it goes', () => {
  expect(backLabel('globe')).toBe('Terug naar de globe')
  expect(backLabel('timeline')).toBe('Terug naar de tijdlijn')
})
