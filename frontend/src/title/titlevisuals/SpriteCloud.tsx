// PROTOTYPE — throwaway (#75), take four. Exactly spite's CSS3DClouds idea
// (github.com/spite/CSS3DClouds, MIT — see clouds/LICENSE): a cloud is a pile
// of photographic cloud sprites at random offsets, rotations, scales and
// depths. The light is baked into the textures once, on a canvas: the lit
// sprites are tinted to the sun's colour, the shadowed ones darkened into a
// cool teal. After that the clouds are plain images, so moving them (drift,
// the descent) is pure transform and opacity — no filters in the animation.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import cloudUrl from './clouds/cloud.png'
import darkCloudUrl from './clouds/darkCloud.png'

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Multiply tints: the colour of the sprites in the light and of those in the shadow. */
export type Grade = { key: string; lit: string; shade: string }

export const GOLDEN: Grade = { key: 'golden', lit: '#ffd9a0', shade: '#46696f' }
export const BRIGHT: Grade = { key: 'bright', lit: '#fff1d4', shade: '#a7b9bd' }

type Textures = { lit: [string, string]; shade: [string, string] }
const baked = new Map<string, Promise<Textures>>()

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

// tint with multiply, then give back the sprite's own alpha
function tint(img: HTMLImageElement, color: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}

function bake(grade: Grade): Promise<Textures> {
  let p = baked.get(grade.key)
  if (!p) {
    p = Promise.all([load(cloudUrl), load(darkCloudUrl)]).then(([light, dark]) => ({
      lit: [tint(light, grade.lit), tint(dark, grade.lit)] as [string, string],
      shade: [tint(light, grade.shade), tint(dark, grade.shade)] as [string, string],
    }))
    baked.set(grade.key, p)
  }
  return p
}

export function SpriteCloud({ seed, x, y, w, h, sprites = 12, grade = GOLDEN, opacity = 1, style }: {
  seed: number
  /** centre, in % of the screen */
  x: number
  y: number
  /** the cloud's footprint in px */
  w: number
  h: number
  sprites?: number
  grade?: Grade
  opacity?: number
  style?: CSSProperties
}) {
  const [textures, setTextures] = useState<Textures | null>(null)
  useEffect(() => {
    let live = true
    bake(grade).then((t) => live && setTextures(t))
    return () => {
      live = false
    }
  }, [grade])

  const layers = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: sprites }, () => {
      const u = r() + r() - 1 // crowded towards the middle
      const v = r() // 0 top .. 1 bottom
      const size = Math.min(w, h * 1.8) * (0.34 + 0.34 * (1 - Math.abs(u)) * (0.5 + 0.5 * r()))
      return {
        left: w / 2 + u * w * 0.38 - size / 2,
        top: h * (0.15 + v * 0.7) - size / 2,
        size,
        depth: r(),
        rotate: r() * 360,
        dark: r() < 0.4,
        low: v > 0.5,
      }
    }).sort((a, b) => Number(b.low) - Number(a.low) || a.depth - b.depth) // shadowed sprites first, so the lit ones sit on top
  }, [seed, sprites, w, h])

  if (!textures) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: w,
        height: h,
        transform: 'translate(-50%, -50%)',
        opacity,
        pointerEvents: 'none',
        ...style,
      }}
    >
      {layers.map((l, i) => (
        <img
          key={i}
          src={textures[l.low ? 'shade' : 'lit'][l.dark ? 1 : 0]}
          alt=""
          draggable={false}
          style={{ position: 'absolute', left: l.left, top: l.top, width: l.size, height: l.size, transform: `rotate(${l.rotate}deg)`, opacity: 0.88 }}
        />
      ))}
    </div>
  )
}
