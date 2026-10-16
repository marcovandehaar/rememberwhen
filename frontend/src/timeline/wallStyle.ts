import type { CSSProperties } from 'react'
import { MODE_BG } from '../title/modes'

export const PAPER = MODE_BG.timeline
export const INK = '#2a2018'

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .32  0 0 0 0 .22  0 0 0 0 .1  0 0 0 .11 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`
export const WALL: CSSProperties = {
  background: `${GRAIN}, radial-gradient(ellipse 120% 90% at 50% 40%, transparent 55%, rgba(120,85,40,.16) 100%), ${PAPER}`,
}
export const PINS = ['#d4492f', '#2f6fd4', '#e0a51f', '#3f9a5a']
