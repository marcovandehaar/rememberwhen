import { useEffect, useRef, useState } from 'react'
import GlobeGL from 'react-globe.gl'
import type { Memory } from '../catalog/types'
import { PinChooser } from './PinChooser'
import { pinsFor, type Pin } from './pins'
import { useViewportSize } from './useViewportSize'

// Variant A (#7): photographic night earth, glowing cover-photo pin, no
// bloom — it cost two thirds of the framerate on the 2019 iPad and washed
// the background, because globe.gl's composer does no colour management
// (ADR 0002). Opens on Europe; most Memories are there (#7).
const HOME = { lat: 47, lng: 9, altitude: 0.78 }
const ZOOM_ALTITUDE = 0.28
const TEX = {
  night: '//unpkg.com/three-globe/example/img/earth-night.jpg',
  topology: '//unpkg.com/three-globe/example/img/earth-topology.png',
}

type GlobeInstance = {
  pointOfView: {
    (): { lat: number; lng: number; altitude: number }
    (pov: { lat: number; lng: number; altitude?: number }, ms?: number): void
  }
  controls: () => { autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean; minDistance: number; maxDistance: number }
}

export function Globe({ memories, onSelect }: { memories: Memory[]; onSelect: (memory: Memory) => void }) {
  const ref = useRef<GlobeInstance | null>(null)
  const pins = pinsFor(memories)
  const { width, height } = useViewportSize()
  // Set once the fly-in lands on a pin with more than one Memory — #11/#32:
  // tapping a shared pin zooms first, then offers a chooser, rather than
  // picking a Memory for the operator.
  const [chooserPin, setChooserPin] = useState<Pin | null>(null)

  useEffect(() => {
    const g = ref.current
    if (!g) return
    const c = g.controls()
    c.autoRotate = false
    c.enableDamping = true
    c.minDistance = 130
    c.maxDistance = 500
  }, [])

  return (
    <>
      <GlobeGL
        ref={ref as never}
        width={width}
        height={height}
        onGlobeReady={() => ref.current?.pointOfView(HOME, 0)}
        globeImageUrl={TEX.night}
        bumpImageUrl={TEX.topology}
        backgroundColor="#04070f"
        showAtmosphere={false}
        htmlElementsData={pins}
        htmlLat={(d: object) => (d as Pin).lat}
        htmlLng={(d: object) => (d as Pin).lng}
        htmlAltitude={0.05}
        htmlElement={(raw: object) => {
          const pin = raw as Pin
          const el = document.createElement('div')
          el.style.cssText = 'cursor: pointer; pointer-events: auto;'
          // The library owns `el`'s own transform (it repositions it every
          // frame via CSS2DRenderer), so the press scale lives on this inner
          // wrapper instead — same .12s ease-out motif as PinChooser's rows
          // and arrows, so the pin rhymes with the sheet it's about to open.
          const inner = document.createElement('div')
          inner.style.cssText = 'position: relative; transform: scale(1); transition: transform .12s ease-out;'
          inner.innerHTML = `
            <div style="width:46px;height:46px;border-radius:50%;overflow:hidden;
                        border:2px solid rgba(255,255,255,.9);
                        box-shadow:0 0 16px rgba(120,180,255,.55), 0 4px 12px rgba(0,0,0,.6);">
              <img src="${pin.cover}" style="width:100%;height:100%;object-fit:cover;display:block" />
            </div>
            <div style="margin-top:5px;text-align:center;color:#fff;font:600 10px/1.2 -apple-system,system-ui,sans-serif;
                        text-shadow:0 1px 4px rgba(0,0,0,.95);white-space:nowrap">${pin.destinationName}</div>`
          el.appendChild(inner)
          el.onpointerdown = () => (inner.style.transform = 'scale(0.88)')
          el.onpointerup = el.onpointerleave = el.onpointercancel = () => (inner.style.transform = 'scale(1)')
          el.onclick = () => {
            const g = ref.current
            if (!g) return
            // Echoes the pin's own ring, then pulses out and fades — a quick
            // "tap registered" pip on top of the press scale, gone well
            // before the 1200ms fly-in lands.
            const ring = document.createElement('div')
            ring.style.cssText =
              'position:absolute;top:0;left:0;width:46px;height:46px;border-radius:50%;border:2px solid rgba(255,255,255,.9);pointer-events:none;'
            inner.appendChild(ring)
            ring.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(1.7)', opacity: 0 }], {
              duration: 550,
              easing: 'ease-out',
            }).onfinish = () => ring.remove()
            g.pointOfView({ lat: pin.lat, lng: pin.lng, altitude: ZOOM_ALTITUDE }, 1200)
            window.setTimeout(() => setChooserPin(pin), 1200)
          }
          return el
        }}
      />
      {chooserPin && (
        <PinChooser
          pin={chooserPin}
          pins={pins}
          onChoose={(memory) => {
            setChooserPin(null)
            onSelect(memory)
          }}
          onDismiss={() => setChooserPin(null)}
          onNavigate={(pin) => {
            const g = ref.current
            if (g) g.pointOfView({ lat: pin.lat, lng: pin.lng, altitude: ZOOM_ALTITUDE }, 1200)
            setChooserPin(pin)
          }}
        />
      )}
    </>
  )
}
