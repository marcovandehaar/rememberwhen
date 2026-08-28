// PLACEHOLDER DATA — swap for Marco's real trips before judging anything.
//
// Two things are fake here and both matter:
//   1. the Destination list itself (names + coordinates)
//   2. the cover images, which are generated gradients rather than photographs
//
// The globe's look depends heavily on what the pins actually carry, so a
// verdict on "does this clear the bar" is only worth something once real
// cover photos are in. To swap: set `cover` to a URL (a local file in
// /public works) and delete the generator below.
//
// `Zillertal` appears TWICE at an identical coordinate on purpose — that is
// the coincident-pin problem from issue #11, and it should be visible here
// rather than in production.

export type Destination = {
  id: string
  /** The Destination name as it appears on the globe. */
  name: string
  /** Which Memory this pin belongs to — two Memories may share a Destination. */
  memory: string
  lat: number
  lng: number
  cover: string
}

type Raw = Omit<Destination, 'cover' | 'id'> & { coverFile?: string }

const RAW: Raw[] = [
  // REAL — Marco's own trips and cover photos. The files live in
  // public/covers/, which is gitignored: this repo is public.
  { name: 'Zillertal', memory: 'Wintersport Zillertal 2024', lat: 47.2, lng: 11.8667, coverFile: '/covers/zillertal-2024.jpg' },
  { name: 'Allgäu', memory: 'Zomervakantie Allgäu 2025', lat: 47.55, lng: 10.28, coverFile: '/covers/allgau-2025.jpg' },

  // PLACEHOLDER from here down — invented trips, generated gradient covers.
  { name: 'Zillertal', memory: 'Zillertal 2026', lat: 47.2, lng: 11.8667 },
  { name: 'Legoland Billund', memory: 'Denemarken 2024', lat: 55.735, lng: 9.125 },
  { name: 'Aarhus', memory: 'Denemarken 2024', lat: 56.1629, lng: 10.2039 },
  { name: 'Disneyland Parijs', memory: 'Disneyland 2023', lat: 48.8722, lng: 2.7758 },
  { name: 'Rome', memory: 'Italië 2022', lat: 41.9028, lng: 12.4964 },
  { name: 'Toscane', memory: 'Italië 2022', lat: 43.4, lng: 11.15 },
  { name: 'Zwarte Woud', memory: 'Zuid-Duitsland 2021', lat: 48.0, lng: 8.2 },
  { name: 'Ardennen', memory: 'Ardennen 2020', lat: 50.25, lng: 5.65 },
  { name: 'Texel', memory: 'Texel 2019', lat: 53.0547, lng: 4.797 },
  { name: 'Barcelona', memory: 'Catalonië 2018', lat: 41.3874, lng: 2.1686 },
  { name: 'Lissabon', memory: 'Portugal 2023', lat: 38.7223, lng: -9.1393 },
  { name: 'Bergen', memory: 'Noorwegen 2019', lat: 60.3913, lng: 5.3221 },
  { name: 'Edinburgh', memory: 'Schotland 2017', lat: 55.9533, lng: -3.1883 },
  { name: 'Praag', memory: 'Praag 2016', lat: 50.0755, lng: 14.4378 },
  { name: 'Wenen', memory: 'Oostenrijk 2015', lat: 48.2082, lng: 16.3738 },
  { name: 'Split', memory: 'Kroatië 2022', lat: 43.5081, lng: 16.4402 },
  { name: 'Reykjavik', memory: 'IJsland 2024', lat: 64.1466, lng: -21.9426 },
  { name: 'Zeeland', memory: 'Zeeland 2021', lat: 51.5, lng: 3.8 },
  { name: 'Sauerland', memory: 'Sauerland 2018', lat: 51.25, lng: 8.15 },
  { name: 'Gardameer', memory: 'Gardameer 2025', lat: 45.65, lng: 10.65 },
]

/** Deterministic pseudo-random from a string, so covers are stable across reloads. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

/** Stand-in for a real cover photo: a gradient with the Destination's initials. */
function generateCover(name: string, size = 128): string {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const h1 = hash(name) * 360
  const h2 = (h1 + 40 + hash(name + 'x') * 80) % 360
  const g = ctx.createLinearGradient(0, 0, size, size)
  g.addColorStop(0, `hsl(${h1}, 62%, 52%)`)
  g.addColorStop(1, `hsl(${h2}, 58%, 30%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = `600 ${size * 0.34}px -apple-system, system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const initials = name
    .split(/[\s-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  ctx.fillText(initials, size / 2, size / 2 + size * 0.02)
  return c.toDataURL('image/png')
}

export const DESTINATIONS: Destination[] = RAW.map(({ coverFile, ...d }, i) => ({
  ...d,
  id: `${d.memory}-${i}`,
  cover: coverFile ?? generateCover(d.memory),
}))

/** Groups pins that sit on (near enough) the same coordinate. */
export function coincidentGroups(items: Destination[]): Map<string, Destination[]> {
  const m = new Map<string, Destination[]>()
  for (const d of items) {
    const key = `${d.lat.toFixed(2)},${d.lng.toFixed(2)}`
    const list = m.get(key) ?? []
    list.push(d)
    m.set(key, list)
  }
  return m
}
