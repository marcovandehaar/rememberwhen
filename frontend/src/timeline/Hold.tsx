import type { CSSProperties } from 'react'
import { PINS } from './wallStyle'

// What a polaroid on the wall is made of besides its photo: what holds it up,
// the lifted corners under it, and the warm, glossy print. Shared by the
// timeline's wall and the title screen's "Door de jaren" window.

const TAPES = [
  'repeating-linear-gradient(45deg, rgba(255,226,150,.82) 0 7px, rgba(255,214,128,.82) 7px 14px)',
  'repeating-linear-gradient(-45deg, rgba(170,220,205,.8) 0 6px, rgba(150,206,190,.8) 6px 12px)',
  'repeating-linear-gradient(90deg, rgba(246,186,190,.8) 0 5px, rgba(240,170,176,.8) 5px 10px)',
]
const JAGGED =
  'polygon(0 6%, 3% 0, 6% 8%, 9% 0, 91% 0, 94% 7%, 97% 0, 100% 8%, 100% 92%, 97% 100%, 94% 93%, 91% 100%, 9% 100%, 6% 92%, 3% 100%, 0 94%)'

/** The warmed print of a photo on a polaroid. */
export const PRINT_FILTER = 'sepia(.14) saturate(1.06) contrast(.95) brightness(1.02)'

function Tape({ bg, style }: { bg: string; style: CSSProperties }) {
  return <span style={{ position: 'absolute', height: 26, background: bg, clipPath: JAGGED, boxShadow: '0 1px 2px rgba(0,0,0,.08)', opacity: 0.92, ...style }} />
}

/** A coloured pin, washi tape on top, or corner tape: which one follows the polaroid's place on the wall. */
export function Hold({ i, tilt }: { i: number; tilt: number }) {
  const kind = i % 3
  if (kind === 0) {
    return (
      <span
        style={{
          position: 'absolute',
          top: -8,
          left: '50%',
          marginLeft: -8,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 32%, rgba(255,255,255,.75) 0 12%, ${PINS[i % PINS.length]} 40%, rgba(0,0,0,.35) 100%)`,
          boxShadow: '1px 3px 3px rgba(0,0,0,.3)',
        }}
      />
    )
  }
  if (kind === 1) {
    return <Tape bg={TAPES[i % TAPES.length]} style={{ top: -13, left: '50%', width: '34%', transform: `translateX(-50%) rotate(${-tilt * 0.8}deg)` }} />
  }
  return (
    <>
      <Tape bg={TAPES[(i + 1) % TAPES.length]} style={{ top: -6, left: -18, width: '28%', transform: 'rotate(-38deg)' }} />
      <Tape bg={TAPES[(i + 1) % TAPES.length]} style={{ top: -6, right: -18, width: '28%', transform: 'rotate(38deg)' }} />
    </>
  )
}

/** Two tilted shadows peeking out under a polaroid's bottom edge, as if its corners lift off the wall. */
export function LiftedCorners() {
  return (
    <>
      <span style={{ position: 'absolute', zIndex: -1, left: '6%', bottom: 10, width: '42%', height: 20, boxShadow: '0 14px 12px rgba(70,45,15,.32)', transform: 'rotate(-4deg)' }} />
      <span style={{ position: 'absolute', zIndex: -1, right: '6%', bottom: 10, width: '42%', height: 20, boxShadow: '0 14px 12px rgba(70,45,15,.32)', transform: 'rotate(4deg)' }} />
    </>
  )
}

/** The print's soft edge burn and gloss, laid over the photo. */
export function PrintGloss() {
  return (
    <>
      <span style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08), inset 0 0 34px rgba(70,40,10,.22)' }} />
      <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 38%)' }} />
    </>
  )
}
