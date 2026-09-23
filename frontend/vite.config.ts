/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// `npm run dev` has no NAS to fetch catalog.json from, so the app otherwise
// renders a Globe with zero memories (a black screen). This serves a fixture
// memory from the dev server only. `configureServer` never runs during
// `vite build`, so this cannot reach frontend/dist or ship to the NAS via
// deploy-nas.ps1 — it only exists while `vite dev` is running.
function devCatalogFixture(): Plugin {
  const catalog = {
    schemaVersion: 1,
    memories: [
      {
        id: 'm1',
        name: 'Toscane Roadtrip',
        destinationName: 'Toscane, Italië',
        destinationCoordinate: { lat: 43.77, lon: 11.25 },
        coverImage: placeholderImage('#2a4d69'),
        chapters: [
          {
            id: 'c1',
            location: { lat: 43.77, lon: 11.25 },
            mediaItems: [
              {
                id: 'i1',
                mediaRef: placeholderImage('#2a4d69'),
                type: 'photo',
                capturedAt: '2026-06-01T10:00:00Z',
                storyRect: { x: 0, y: 0, width: 1, height: 1 },
                shotDuration: 4,
              },
              {
                id: 'i2',
                mediaRef: placeholderImage('#6b4f3a'),
                type: 'photo',
                capturedAt: '2026-06-02T10:00:00Z',
                storyRect: { x: 0, y: 0, width: 1, height: 1 },
                shotDuration: 4,
              },
            ],
          },
        ],
      },
    ],
  }

  return {
    name: 'dev-catalog-fixture',
    configureServer(server) {
      server.middlewares.use('/catalog.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(catalog))
      })
    },
  }
}

function placeholderImage(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="${color}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devCatalogFixture()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
})
