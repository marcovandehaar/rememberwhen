/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { createReadStream, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'

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

// PROTOTYPE (#59): serve the real published catalogue and media, read-only,
// from the Indexer's output folder — RW_CATALOG_DIR in frontend/.env.local
// (gitignored, so the NAS path stays out of the repo). Dev server only.
// Media gets byte ranges, which Safari needs for <video>.
function devPublishedCatalog(dir: string): Plugin {
  const types: Record<string, string> = { jpg: 'image/jpeg', mp4: 'video/mp4', mov: 'video/quicktime', json: 'application/json' }
  const send = (file: string, req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    let size: number
    try {
      size = statSync(file).size
    } catch {
      res.statusCode = 404
      return res.end()
    }
    res.setHeader('Content-Type', types[file.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream')
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', file.endsWith('.json') ? 'no-store' : 'max-age=3600')
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '')
    if (m) {
      const start = m[1] ? Number(m[1]) : size - Number(m[2])
      const end = m[1] && m[2] ? Number(m[2]) : size - 1
      res.statusCode = 206
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
      res.setHeader('Content-Length', end - start + 1)
      return createReadStream(file, { start, end }).pipe(res)
    }
    res.setHeader('Content-Length', size)
    createReadStream(file).pipe(res)
  }
  return {
    name: 'dev-published-catalog',
    configureServer(server) {
      server.middlewares.use('/catalog.json', (req, res) => send(join(dir, 'catalog.json'), req, res))
      server.middlewares.use('/media', (req, res) => {
        const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0])).replace(/^[\\/]+/, '')
        if (rel.startsWith('..')) {
          res.statusCode = 403
          return res.end()
        }
        send(join(dir, 'media', rel), req, res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const catalogDir = loadEnv(mode, process.cwd(), '').RW_CATALOG_DIR
  return {
  plugins: [react(), catalogDir ? devPublishedCatalog(catalogDir) : devCatalogFixture()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
  }
})
