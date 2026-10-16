// PROTOTYPE — throwaway (#75). The sky, sun and clouds of each look; the
// title, windows and descent are untouched.
import type { CSSProperties } from 'react'
import { LitCloud } from './LitCloud'
import { SpriteCloud } from './SpriteCloud'
import type { Theme } from './themes'

const abs: CSSProperties = { position: 'absolute', pointerEvents: 'none' }

// a fixed handful of pin-prick stars
const STAR_POINTS = [[8, 6], [17, 14], [26, 4], [35, 20], [44, 9], [58, 5], [66, 17], [74, 8], [83, 22], [91, 11], [12, 30], [52, 28], [95, 33], [30, 38], [70, 36]]
const STARS = STAR_POINTS.map(([x, y], i) => {
  const r = i % 3 === 0 ? 2 : 1.4
  return `radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgba(255,255,255,${0.5 + (i % 4) * 0.12}), transparent)`
}).join(',')

/** Everything behind the title and the windows. */
export function BackdropBack({ theme }: { theme: Theme }) {
  const { x, y } = theme.sun
  if (theme.key === 'A') {
    return (
      <>
        {/* the sun itself, and the haze around it */}
        <div style={{ ...abs, left: `${x}%`, top: `${y}%`, width: '150vmin', height: '90vmin', transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,214,140,.75), rgba(255,170,90,.25) 55%, rgba(255,170,90,0))' }} />
        <div style={{ ...abs, left: `${x}%`, top: `${y}%`, width: '14vmin', height: '14vmin', transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(closest-side, #fffdf4, #ffe9b0 55%, rgba(255,220,150,0))' }} />
        {/* photographic cloud sprites: towers flanking the windows, a bank behind the sun */}
        <SpriteCloud seed={4} x={6} y={66} w={560} h={320} sprites={16} />
        <SpriteCloud seed={11} x={94} y={64} w={560} h={320} sprites={16} />
        <SpriteCloud seed={17} x={50} y={76} w={480} h={200} sprites={12} />
      </>
    )
  }
  if (theme.key === 'B') {
    return (
      <>
        {/* rays fanning out of the sun, turning ever so slowly */}
        <div style={{ ...abs, left: `${x}%`, top: `${y}%`, width: '260vmax', height: '260vmax', marginLeft: '-130vmax', marginTop: '-130vmax', borderRadius: '50%', background: 'repeating-conic-gradient(from 0deg, rgba(255,240,250,.22) 0deg 3deg, rgba(255,240,250,0) 3deg 11deg)', maskImage: 'radial-gradient(closest-side, #000, transparent 45%)', WebkitMaskImage: 'radial-gradient(closest-side, #000, transparent 45%)', animation: 'rw-spin 120s linear infinite', willChange: 'transform' }} />
        <div style={{ ...abs, left: `${x}%`, top: `${y}%`, width: '120vmin', height: '120vmin', transform: 'translate(-50%,-50%)', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,250,240,.95), rgba(255,215,230,.45) 30%, rgba(255,200,230,0))' }} />
        {/* a sea of fine cloud in perspective: small and flat far away */}
        {[[8, 70], [28, 70.5], [50, 70], [72, 70.5], [92, 70]].map(([cx, cy], i) => (
          <LitCloud key={i} theme={theme} x={cx} y={cy} w={520} h={50} seed={30 + i} freq={0.03} disp={30} octaves={4} flat />
        ))}
        {[[14, 78], [50, 79], [86, 78]].map(([cx, cy], i) => (
          <LitCloud key={i} theme={theme} x={cx} y={cy} w={760} h={120} seed={40 + i} freq={0.022} disp={50} octaves={5} flat />
        ))}
      </>
    )
  }
  // C: the edge of the earth at night
  return (
    <>
      <div style={{ ...abs, inset: 0, background: STARS }} />
      {/* the planet: a huge dark disc, with a thin bright atmosphere on its rim */}
      <div
        style={{
          ...abs,
          left: '50%',
          top: '80%',
          width: '260vw',
          height: '260vw',
          marginLeft: '-130vw',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 0%, #1b3b72 0%, #0a1733 3%, #04070f 10%)',
          boxShadow: '0 -2px 8px 1px rgba(190,225,255,.9), 0 -6px 40px 6px rgba(110,170,255,.55), 0 -40px 140px 30px rgba(70,120,230,.28)',
        }}
      />
      {/* the sun, just behind the rim */}
      <div style={{ ...abs, left: '50%', top: '80%', width: '90vmin', height: '34vmin', transform: 'translate(-50%,-60%)', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,236,200,.95), rgba(255,190,120,.5) 30%, rgba(255,160,100,0))' }} />
      <LitCloud theme={theme} x={20} y={82} w={900} h={90} seed={51} freq={0.012} disp={90} octaves={5} flat opacity={0.95} />
      <LitCloud theme={theme} x={82} y={82} w={900} h={90} seed={52} freq={0.012} disp={90} octaves={5} flat opacity={0.95} />
    </>
  )
}

/** The cloud sea in front of the windows' feet. */
export function BackdropFront({ theme }: { theme: Theme }) {
  const rows: [number, number, number, number, number][] =
    theme.key === 'B'
      ? [[10, 97, 1100, 240, 61], [50, 100, 1200, 260, 62], [90, 97, 1100, 240, 63]]
      : theme.key === 'C'
        ? [[12, 98, 1100, 200, 71], [52, 101, 1200, 220, 72], [92, 98, 1100, 200, 73]]
        : [[10, 100, 900, 300, 64], [46, 104, 1000, 320, 65], [88, 100, 900, 300, 66]]
  const fine = theme.key === 'B'
  if (theme.key === 'A') {
    return (
      <div style={{ ...abs, inset: 0, zIndex: 3, animation: 'rw-drift 16s ease-in-out infinite alternate' }}>
        <SpriteCloud seed={31} x={12} y={104} w={1000} h={200} sprites={24} />
        <SpriteCloud seed={32} x={50} y={107} w={1100} h={210} sprites={26} />
        <SpriteCloud seed={33} x={88} y={104} w={1000} h={200} sprites={24} />
      </div>
    )
  }
  return (
    <div style={{ ...abs, inset: 0, zIndex: 3, animation: 'rw-drift 16s ease-in-out infinite alternate' }}>
      {rows.map(([x, y, w, h, seed]) => (
        <LitCloud
          key={seed}
          theme={theme}
          x={x}
          y={y}
          w={w}
          h={h}
          seed={seed}
          freq={fine ? 0.018 : 0.009}
          disp={fine ? 90 : 160}
          octaves={fine ? 5 : 4}
          
        />
      ))}
    </div>
  )
}
