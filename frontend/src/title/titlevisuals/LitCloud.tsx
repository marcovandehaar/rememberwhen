// PROTOTYPE — throwaway (#75). A cloud after CSS-Tricks' "Drawing realistic
// clouds with SVG and CSS": a plain blob whose outline is torn by fractal
// noise (feTurbulence + feDisplacementMap), then lit like a surface
// (feDiffuseLighting) from the direction of the sun. Static — it is
// rasterised once and only ever moved with a transform.
import { useId, type CSSProperties } from 'react'
import type { Theme } from './themes'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

export function LitCloud({ theme, x, y, w, h, seed, freq = 0.008, disp = 150, octaves = 4, el = 35, surface = 6, detail = 0.7, rim = 7, opacity = 1, flat = false, style }: {
  theme: Theme
  /** centre, in % of the screen */
  x: number
  y: number
  w: number
  h: number
  seed: number
  freq?: number
  disp?: number
  octaves?: number
  /** light elevation in degrees: low = raking light, strong rims */
  el?: number
  surface?: number
  detail?: number
  /** how far the rim light reaches into the cloud, in px */
  rim?: number
  opacity?: number
  flat?: boolean
  style?: CSSProperties
}) {
  const id = useId().replace(/:/g, '')
  // the light comes from the sun: its direction in the screen plane, y pointing down like SVG's
  const az = (Math.atan2(theme.sun.y - y, (theme.sun.x - x) * 1.33) * 180) / Math.PI
  const [lr, lg, lb] = rgb(theme.light)

  return (
    <div style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: w, height: h, transform: 'translate(-50%, -50%)', opacity, pointerEvents: 'none', ...style }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id={id} x="-35%" y="-70%" width="170%" height="240%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={octaves} seed={seed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={disp} xChannelSelector="R" yChannelSelector="G" result="shape" />
          {/* body: the shaded colour, torn into the cloud's outline */}
          <feFlood floodColor={theme.shade} result="shadeFill" />
          <feComposite in="shadeFill" in2="shape" operator="in" result="body" />
          {/* billows: fine noise as relief, lit from the sun's side, laid over the body */}
          <feTurbulence type="fractalNoise" baseFrequency={freq * 1.8} numOctaves="2" seed={seed + 5} result="fine" />
          <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="relief" />
          <feDiffuseLighting in="relief" surfaceScale={surface} diffuseConstant="1" lightingColor={theme.light} result="puffLit">
            <feDistantLight azimuth={az} elevation={el} />
          </feDiffuseLighting>
          <feColorMatrix in="puffLit" type="matrix" values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${detail} 0 0 0 0`} result="puff" />
          <feComposite in="puff" in2="shape" operator="in" result="puffIn" />
          {/* rim light: the part of the cloud whose sun-side neighbour is sky */}
          <feOffset in="shape" dx={-rim * Math.cos((az * Math.PI) / 180)} dy={-rim * Math.sin((az * Math.PI) / 180)} result="shifted" />
          <feComposite in="shape" in2="shifted" operator="out" result="rimEdge" />
          <feGaussianBlur in="rimEdge" stdDeviation="2.5" result="rimTightA" />
          <feGaussianBlur in="rimEdge" stdDeviation="12" result="rimWideA" />
          <feColorMatrix in="rimTightA" type="matrix" values={`0 0 0 0 ${lr}  0 0 0 0 ${lg}  0 0 0 0 ${lb}  0 0 0 1.1 0`} result="rimTight" />
          <feColorMatrix in="rimWideA" type="matrix" values={`0 0 0 0 ${lr}  0 0 0 0 ${lg}  0 0 0 0 ${lb}  0 0 0 0.55 0`} result="rimWide" />
          <feMerge result="cloud">
            <feMergeNode in="body" />
            <feMergeNode in="puffIn" />
            <feMergeNode in="rimWide" />
            <feMergeNode in="rimTight" />
          </feMerge>
          <feGaussianBlur in="shape" stdDeviation="2" result="mask" />
          <feComposite in="cloud" in2="mask" operator="in" />
        </filter>
      </svg>
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#000',
          borderRadius: flat ? '50%' : '50% 50% 42% 42% / 78% 78% 22% 22%',
          filter: `url(#${id})`,
        }}
      />
    </div>
  )
}
