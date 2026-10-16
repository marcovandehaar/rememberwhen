import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Memory } from '../catalog/types'
import { Timeline } from './Timeline'
import { TimelineView } from './timelineView'

// jsdom has no layout and no Element.scrollTo; the pager only needs to accept the call.
beforeEach(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function memory(id: string, date: string, extra: Partial<Memory> = {}): Memory {
  return { id, name: `Memory ${id}`, destination: null, date, coverImage: `${id}-thumb.jpg`, chapters: [], ...extra }
}

const trip = { name: 'Zeeland', coordinate: { lat: 51.5, lon: 3.8 } }
const memories = [
  memory('old', '2016-04-09'),
  memory('trip', '2023-07-02', { destination: trip }),
  memory('new', '2023-09-10'),
]

test('every Memory appears on the page of its year, and years without Memories have none', () => {
  render(<Timeline memories={memories} view={new TimelineView()} onOpen={() => {}} />)

  const pages = screen.getAllByRole('region')
  expect(pages.map((p) => p.getAttribute('aria-label'))).toEqual(['2016', '2023'])
  expect(within(pages[0]).getByRole('button', { name: 'Memory old' })).toBeInTheDocument()
  expect(within(pages[1]).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Memory trip', 'Memory new'])
})

test('it opens on the newest year', () => {
  render(<Timeline memories={memories} view={new TimelineView()} onOpen={() => {}} />)

  expect(screen.getByRole('heading', { name: '2023' })).toBeInTheDocument()
})

test('only Trips carry the pin badge, with the Destination name', () => {
  render(<Timeline memories={memories} view={new TimelineView()} onOpen={() => {}} />)

  const badges = screen.getAllByTestId('trip-badge')
  expect(badges).toHaveLength(1)
  expect(badges[0]).toHaveTextContent('Zeeland')
})

test('a tapped polaroid lifts first, then its Story opens', () => {
  vi.useFakeTimers()
  const onOpen = vi.fn()
  render(<Timeline memories={memories} view={new TimelineView()} onOpen={onOpen} />)

  fireEvent.click(screen.getByRole('button', { name: 'Memory trip' }))
  expect(onOpen).not.toHaveBeenCalled()

  act(() => {
    vi.advanceTimersByTime(200)
  })
  expect(onOpen).toHaveBeenCalledWith(memories[1])
})

test('coming back with the remembered view lands on the same year', () => {
  const view = new TimelineView()
  view.showPage(0)

  render(<Timeline memories={memories} view={view} onOpen={() => {}} />)

  expect(screen.getByRole('heading', { name: '2016' })).toBeInTheDocument()
})

test('the arrows step to the neighbouring year', () => {
  const view = new TimelineView()
  render(<Timeline memories={memories} view={view} onOpen={() => {}} />)

  fireEvent.click(screen.getByRole('button', { name: 'Vorig jaar' }))

  expect(screen.getByRole('heading', { name: '2016' })).toBeInTheDocument()
  expect(view.page).toBe(0)
})
