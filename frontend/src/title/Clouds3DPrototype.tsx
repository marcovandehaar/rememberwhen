// PROTOTYPE — throwaway, for "Title screen: look, intro and way back" (#58).
// Volumetric-looking clouds the CSS3DClouds way (spite.github.io/CSS3DClouds):
// each cloud is a cluster of semi-transparent puff sprites placed in real 3D
// space under a CSS perspective, each sprite slowly turning. The puff texture
// is painted once into a canvas at startup (soft blobs + value noise + a
// warm shadow on the underside); after that every moving part is a CSS
// transform, so the browser composites it on the GPU.
import { motion } from 'framer-motion'
import { useMemo, type CSSProperties } from 'react'

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function valueNoise(seed: number) {
  const r = rng(seed)
  const N = 64
  const t = Array.from({ length: N * N }, () => r())
  const at = (x: number, y: number) => t[(((y % N) + N) % N) * N + (((x % N) + N) % N)]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = at(xi, yi)
    const b = at(xi + 1, yi)
    const c = at(xi, yi + 1)
    const d = at(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

const textures = new Map<number, string>()

function puffTexture(seed: number): string {
  const hit = textures.get(seed)
  if (hit) return hit
  const S = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = S
  const g = canvas.getContext('2d')!
  const r = rng(seed)

  // cotton: many soft blobs, denser toward the middle, flatter at the base
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2
    const d = Math.pow(r(), 0.9) * S * 0.26
    const x = S / 2 + Math.cos(a) * d
    const y = S / 2 + Math.sin(a) * d * 0.7 - (Math.sin(a) < 0 ? 8 : 0)
    const rad = S * (0.07 + r() * 0.13)
    const grad = g.createRadialGradient(x, y, 0, x, y, rad)
    grad.addColorStop(0, 'rgba(255,255,255,0.32)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }

  // break the outline up into vapour with a few octaves of noise
  const n = valueNoise(seed + 99)
  const fbm = (x: number, y: number) => (n(x, y) + n(x * 2, y * 2) / 2 + n(x * 4, y * 4) / 4 + n(x * 8, y * 8) / 8) / 1.875
  const img = g.getImageData(0, 0, S, S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const k = (y * S + x) * 4
      const dx = (x - S / 2) / (S / 2)
      const dy = (y - S / 2) / (S / 2)
      const edge = Math.max(0, Math.min(1, (1 - Math.hypot(dx, dy)) * 2.2))
      const vapour = Math.max(0, Math.min(1, 0.15 + fbm((x / S) * 7, (y / S) * 7) * 1.15))
      img.data[k + 3] = Math.min(255, img.data[k + 3] * vapour * edge * 1.25)
    }
  }
  g.putImageData(img, 0, 0)

  // lit from above and behind by a low sun: warm top, cool-rose underside
  g.globalCompositeOperation = 'source-atop'
  const shade = g.createLinearGradient(0, S * 0.2, 0, S * 0.85)
  shade.addColorStop(0, 'rgba(255,236,214,0.35)')
  shade.addColorStop(0.5, 'rgba(255,255,255,0)')
  shade.addColorStop(1, 'rgba(178,150,178,0.55)')
  g.fillStyle = shade
  g.fillRect(0, 0, S, S)

  const url = canvas.toDataURL()
  textures.set(seed, url)
  return url
}

export type CloudSpec = { x: number; y: number; z: number; size: number; seed: number }

function Cloud3D({ x, y, z, size, seed, sprites }: CloudSpec & { sprites: number }) {
  const layers = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: sprites }, () => ({
      dx: (r() - 0.5) * size * 0.9,
      dy: (r() - 0.5) * size * 0.22,
      dz: (r() - 0.5) * size * 0.5,
      s: 0.55 + r() * 0.6,
      rot: r() * 360,
      spin: 70 + r() * 110,
      reverse: r() < 0.5,
      tex: puffTexture(1 + Math.floor(r() * 3)),
      o: 0.75 + r() * 0.25,
    }))
  }, [seed, size, sprites])
  return (
    <div style={{ position: 'absolute', transformStyle: 'preserve-3d', transform: `translate3d(${x}px, ${y}px, ${z}px)` }}>
      {layers.map((l, i) => {
        const w = size * l.s
        return (
          <div key={i} style={{ position: 'absolute', transformStyle: 'preserve-3d', transform: `translate3d(${l.dx}px, ${l.dy}px, ${l.dz}px) rotate(${l.rot}deg)` }}>
            <img
              src={l.tex}
              draggable={false}
              style={{
                position: 'absolute',
                left: -w / 2,
                top: -w / 2,
                width: w,
                height: w,
                opacity: l.o,
                animation: `rw-spin ${l.spin}s linear infinite${l.reverse ? ' reverse' : ''}`,
                willChange: 'transform',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

// A 3D cloud field. Its world origin sits at (originX, originY) of the
// screen, which is also the vanishing point, so far clouds gather there.
export function CloudField({
  clouds,
  sprites = 6,
  originY = '50%',
  perspective = 700,
  worldZ,
  style,
}: {
  clouds: CloudSpec[]
  sprites?: number
  originY?: string
  perspective?: number
  worldZ?: { from: number; to: number; duration: number; delay: number }
  style?: CSSProperties
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', perspective, perspectiveOrigin: `50% ${originY}`, ...style }}>
      <motion.div
        initial={worldZ ? { z: worldZ.from } : false}
        animate={worldZ ? { z: worldZ.to } : undefined}
        transition={worldZ ? { duration: worldZ.duration, delay: worldZ.delay, ease: [0.45, 0, 0.25, 1] } : undefined}
        style={{ position: 'absolute', left: '50%', top: originY, transformStyle: 'preserve-3d' }}
      >
        {clouds.map((c, i) => (
          <Cloud3D key={i} {...c} sprites={sprites} />
        ))}
      </motion.div>
    </div>
  )
}

// A cloud bank to fly through: thick right in front of the camera, thinning
// with depth, so flying forward reads as the weather clearing up.
export function cloudBank(seed: number, o: { count: number; depth: number; W: number; H: number; perspective?: number }): CloudSpec[] {
  const r = rng(seed)
  const p = o.perspective ?? 700
  return Array.from({ length: o.count }, (_, i) => {
    // squared spacing: most clouds sit in the first stretch of the flight
    const t = Math.pow((i + r()) / o.count, 1.9)
    const z = -120 - t * o.depth
    const widen = (p - z) / p
    // early clouds hug the line of sight so the view is filled; later ones
    // drift out toward the edges, opening a hole in the middle
    const reach = 0.35 + t * 0.9
    return {
      x: (r() - 0.5) * o.W * reach * widen,
      y: (r() - 0.5) * o.H * reach * widen * 0.9,
      z,
      size: (760 - t * 260) * (0.8 + r() * 0.5),
      seed: seed * 100 + i,
    }
  })
}

// A layer of cloud spread between two depths, `spread` wide at the near end.
export function scatter(seed: number, count: number, o: { zNear: number; zFar: number; yNear: number; yFar: number; spread: number; size: number; yJitter?: number }): CloudSpec[] {
  const r = rng(seed)
  return Array.from({ length: count }, (_, i) => {
    const t = (i + r() * 0.8) / count // 0 = near, 1 = far
    const z = o.zNear + (o.zFar - o.zNear) * t
    const y = o.yNear + (o.yFar - o.yNear) * t + (r() - 0.5) * (o.yJitter ?? 30)
    // widen with depth so the field still fills the screen far away
    const widen = (perspective: number) => (perspective - z) / perspective
    return { x: (r() - 0.5) * o.spread * widen(700), y, z, size: o.size * (0.8 + r() * 0.5), seed: seed * 100 + i }
  })
}
