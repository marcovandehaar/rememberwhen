import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'

// react-globe.gl needs a real WebGL context, which jsdom doesn't provide.
// App's own job here is just "fetch the catalog and hand it to the globe" —
// the globe's own rendering is Globe.tsx's concern, not App's.
vi.mock('./globe/Globe', () => ({
  Globe: ({ memories }: { memories: { destination: { name: string } | null }[] }) => (
    <div data-testid="globe">{memories.map((m) => m.destination?.name).join(',')}</div>
  ),
}))

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const catalog = {
  schemaVersion: 2,
  memories: [{ id: 'a', name: 'A', destination: { name: 'Zeeland', coordinate: { lat: 1, lon: 2 } }, date: '2026-01-01', coverImage: 'x.jpg', chapters: [] }],
}

function stubCatalogFetch() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve(catalog) }))
}

test('every launch starts on the title screen, with the app title', async () => {
  stubCatalogFetch()

  render(<App />)

  expect(await screen.findByRole('heading', { name: /remember when/i })).toBeInTheDocument()
  expect(screen.queryByTestId('globe')).not.toBeInTheDocument()
})

test('a tap during the intro skips it', async () => {
  stubCatalogFetch()
  render(<App />)

  fireEvent.pointerDown(await screen.findByTestId('title-skip'))

  expect(screen.queryByTestId('title-skip')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /De wereld rond/ })).toBeInTheDocument()
})

test('choosing "De wereld rond" opens the globe with the catalogue, and the sun button leads back to the title', async () => {
  stubCatalogFetch()
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: /De wereld rond/ }))

  expect(await screen.findByTestId('globe', undefined, { timeout: 2000 })).toHaveTextContent('Zeeland')

  fireEvent.click(screen.getByRole('button', { name: 'Terug naar het beginscherm' }))

  expect(await screen.findByRole('heading', { name: /remember when/i })).toBeInTheDocument()
  expect(screen.queryByTestId('globe')).not.toBeInTheDocument()
  // the way back lands on the settled screen: no intro to skip
  expect(screen.queryByTestId('title-skip')).not.toBeInTheDocument()
})

test('choosing "Door de jaren" opens the timeline on the newest year', async () => {
  stubCatalogFetch()
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: /Door de jaren/ }))

  expect(await screen.findByRole('heading', { name: '2026' }, { timeout: 2000 })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Terug naar het beginscherm' })).toBeInTheDocument()
  expect(screen.queryByTestId('globe')).not.toBeInTheDocument()
})
