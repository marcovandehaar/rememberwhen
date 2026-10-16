import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import type { Memory } from '../catalog/types'
import { Story } from './Story'

afterEach(cleanup)

const item = { id: 'i1', mediaRef: 'a.jpg', type: 'photo' as const, capturedAt: '2023-05-14T10:00:00Z', storyRect: { x: 0, y: 0, width: 1, height: 1 }, shotDuration: 4 }
const memory: Memory = {
  id: 'm',
  name: 'Onze nieuwe hond',
  destination: null,
  date: '2023-05-14',
  coverImage: 'a.jpg',
  chapters: [{ id: 'c1', location: null, mediaItems: [item] }],
}

test('the back button of a Story opened from the timeline says it goes back to the timeline', () => {
  render(<Story memory={memory} from="timeline" onOpenItem={() => {}} onBack={() => {}} />)

  expect(screen.getByRole('button', { name: 'Terug naar de tijdlijn' })).toBeInTheDocument()
})

test('the back button of a Story opened from the globe says it goes back to the globe', () => {
  render(<Story memory={memory} from="globe" onOpenItem={() => {}} onBack={() => {}} />)

  expect(screen.getByRole('button', { name: 'Terug naar de globe' })).toBeInTheDocument()
})

test('the Story of a Memory that is not a Trip is titled with its name, and its date as the subtitle', () => {
  render(<Story memory={memory} from="timeline" onOpenItem={() => {}} onBack={() => {}} />)

  expect(screen.getByText('Onze nieuwe hond')).toBeInTheDocument()
  expect(screen.getByText('14 mei 2023')).toBeInTheDocument()
})
