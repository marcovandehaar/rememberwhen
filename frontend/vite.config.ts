/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// `npm run dev` has no NAS to fetch catalog.json from, so the app otherwise
// renders a Globe with zero memories (a black screen). This serves a fixture
// Memories from the dev server only. `configureServer` never runs during
// `vite build`, so this cannot reach frontend/dist or ship to the NAS via
// deploy-nas.ps1 — it only exists while `vite dev` is running.

// id, name, date, Destination (null: not a Trip), cover colour — spread over several years so the timeline has pages to swipe.
const FIXTURE_MEMORIES: [string, string, string, string | null, string][] = [
  ['m1', 'Toscane Roadtrip', '2026-06-01', 'Toscane, Italië', '#2a4d69'],
  ['m2', 'Verjaardag Opa', '2026-03-14', null, '#8a5a44'],
  ['m3', 'Zeeland', '2026-08-20', 'Zeeland', '#3f7d6e'],
  ['m4', 'Eerste schooldag', '2025-09-01', null, '#b08d3c'],
  ['m5', 'Zillertal', '2025-02-10', 'Zillertal, Oostenrijk', '#4a6fa5'],
  ['m6', 'Kerst bij oma', '2025-12-25', null, '#9c3d3d'],
  ['m7', 'Barcelona', '2025-05-03', 'Barcelona', '#c26b2e'],
  ['m8', 'Stranddag', '2025-07-19', null, '#4f9bb0'],
  ['m9', 'Nieuwe hond', '2025-04-12', null, '#6d5a8c'],
  ['m10', 'Lissabon', '2023-10-07', 'Lissabon', '#d19a2a'],
  ['m11', 'Verhuizing', '2023-04-09', null, '#5b6b4a'],
  ['m12', 'Schotland', '2021-08-01', 'Schotland', '#46607a'],
  ['m13', 'Bruiloft Anne', '2019-06-22', null, '#a35d7a'],
  ['m14', 'Noorwegen', '2019-07-30', 'Noorwegen', '#2f5d8a'],
]

function devCatalogFixture(): Plugin {
  const catalog = {
    schemaVersion: 2,
    memories: [
      ...FIXTURE_MEMORIES.map(([id, name, date, destination, color], i) => ({
        id,
        name,
        destination: destination ? { name: destination, coordinate: { lat: 43.77 + i, lon: 11.25 + i } } : null,
        date,
        coverImage: placeholderImage(color),
        chapters: [
          {
            id: `${id}-c1`,
            location: destination ? { lat: 43.77 + i, lon: 11.25 + i } : null,
            mediaItems: [
              { id: `${id}-i1`, mediaRef: placeholderImage(color), type: 'photo', capturedAt: `${date}T10:00:00Z`, storyRect: { x: 0, y: 0, width: 1, height: 1 }, shotDuration: 4 },
              { id: `${id}-i2`, mediaRef: placeholderImage('#6b4f3a'), type: 'photo', capturedAt: `${date}T11:00:00Z`, storyRect: { x: 0, y: 0, width: 1, height: 1 }, shotDuration: 4 },
            ],
          },
        ],
      })),
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
