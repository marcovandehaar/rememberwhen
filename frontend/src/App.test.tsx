import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import App from './App'

// react-globe.gl needs a real WebGL context, which jsdom doesn't provide.
// App's own job here is just "fetch the catalog and hand it to the globe" —
// the globe's own rendering is Globe.tsx's concern, not App's.
vi.mock('./globe/Globe', () => ({
  Globe: ({ memories }: { memories: { destinationName: string }[] }) => (
    <div data-testid="globe">{memories.map((m) => m.destinationName).join(',')}</div>
  ),
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

test('fetches the sample catalog and renders the globe with its destinations', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          schemaVersion: 1,
          memories: [{ id: 'a', name: 'A', destinationName: 'Zeeland', destinationCoordinate: { lat: 1, lon: 2 }, coverImage: 'x.jpg', chapters: [] }],
        }),
    }),
  )

  render(<App />)

  expect(await screen.findByTestId('globe')).toHaveTextContent('Zeeland')
})
