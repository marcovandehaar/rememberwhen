import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import cloudUrl from './clouds/cloud.png'
import darkCloudUrl from './clouds/darkCloud.png'
import { layoutSprites } from './skyCloudLayout'

// A photographic cloud: a pile of cloud sprites (textures from spite's
// CSS3DClouds, MIT: see clouds/LICENSE). The golden-hour light is baked into
// the textures once, on a canvas: sprites in the light are multiplied with
// the sun's colour, those in the cloud's own shadow with a cool teal. After
// that a cloud is only plain images, so drifting it is a pure transform and
// no filter ever runs in an animation.

const LIT = '#ffd9a0'
const SHADE = '#46696f'

type Textures = { lit: [string, string]; shade: [string, string] }

const plain: Textures = { lit: [cloudUrl, darkCloudUrl], shade: [cloudUrl, darkCloudUrl] }
let baked: Promise<Textures> | null = null

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

// tint with multiply, then give back the sprite's own alpha
function tint(img: HTMLImageElement, color: string): string | null {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** The tinted textures, baked once and shared by every cloud; the untinted ones if the canvas can't do it. */
function bakedTextures(): Promise<Textures> {
  baked ??= Promise.all([load(cloudUrl), load(darkCloudUrl)])
    .then(([light, dark]) => {
      const lit: [string | null, string | null] = [tint(light, LIT), tint(dark, LIT)]
      const shade: [string | null, string | null] = [tint(light, SHADE), tint(dark, SHADE)]
      return lit[0] && lit[1] && shade[0] && shade[1] ? ({ lit, shade } as Textures) : plain
    })
    .catch(() => plain)
  return baked
}

export function SkyCloud({ seed, x, y, w, h, sprites = 12, style }: {
  seed: number
  /** centre, in % of the screen */
  x: number
  y: number
  /** the cloud's footprint in px */
  w: number
  h: number
  sprites?: number
  style?: CSSProperties
}) {
  const [textures, setTextures] = useState<Textures | null>(null)
  useEffect(() => {
    let live = true
    bakedTextures().then((t) => live && setTextures(t))
    return () => {
      live = false
    }
  }, [])

  const layout = useMemo(() => layoutSprites(seed, sprites, w, h), [seed, sprites, w, h])
  if (!textures) return null

  return (
    <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: w, height: h, transform: 'translate(-50%, -50%)', pointerEvents: 'none', ...style }}>
      {layout.map((s, i) => (
        <img
          key={i}
          src={textures[s.low ? 'shade' : 'lit'][s.dark ? 1 : 0]}
          alt=""
          draggable={false}
          style={{ position: 'absolute', left: s.left, top: s.top, width: s.size, height: s.size, transform: `rotate(${s.rotate}deg)`, opacity: 0.88 }}
        />
      ))}
    </div>
  )
}
