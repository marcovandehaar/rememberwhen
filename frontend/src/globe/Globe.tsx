import { useEffect, useRef } from 'react'
import GlobeGL from 'react-globe.gl'
import type { Memory } from '../catalog/types'

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

type Pin = { destinationName: string; lat: number; lng: number; cover: string }

type GlobeInstance = {
  pointOfView: {
    (): { lat: number; lng: number; altitude: number }
    (pov: { lat: number; lng: number; altitude?: number }, ms?: number): void
  }
  controls: () => { autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean; minDistance: number; maxDistance: number }
}

// Pins are keyed on destinationName, not on the Memory: two Memories sharing
// a Destination collapse onto one pin (#11). Picking which Memory's cover
// wins for a shared pin, and the tap-to-choose list, is #32's job — this
// ticket only needs the key to already be right so that grouping is cheap
// to add later.
function pinsFor(memories: Memory[]): Pin[] {
  const byDestination = new Map<string, Memory>()
  for (const memory of memories) {
    if (!byDestination.has(memory.destinationName)) byDestination.set(memory.destinationName, memory)
  }
  return [...byDestination.values()].map((m) => ({
    destinationName: m.destinationName,
    lat: m.destinationCoordinate.lat,
    lng: m.destinationCoordinate.lon,
    cover: m.coverImage,
  }))
}

export function Globe({ memories, onSelect }: { memories: Memory[]; onSelect: (memory: Memory) => void }) {
  const ref = useRef<GlobeInstance | null>(null)
  const pins = pinsFor(memories)

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
    <GlobeGL
      ref={ref as never}
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
        el.innerHTML = `
          <div style="width:46px;height:46px;border-radius:50%;overflow:hidden;
                      border:2px solid rgba(255,255,255,.9);
                      box-shadow:0 0 16px rgba(120,180,255,.55), 0 4px 12px rgba(0,0,0,.6);">
            <img src="${pin.cover}" style="width:100%;height:100%;object-fit:cover;display:block" />
          </div>
          <div style="margin-top:5px;text-align:center;color:#fff;font:600 10px/1.2 -apple-system,system-ui,sans-serif;
                      text-shadow:0 1px 4px rgba(0,0,0,.95);white-space:nowrap">${pin.destinationName}</div>`
        el.onclick = () => {
          const memory = memories.find((m) => m.destinationName === pin.destinationName)
          const g = ref.current
          if (memory && g) {
            g.pointOfView({ lat: memory.destinationCoordinate.lat, lng: memory.destinationCoordinate.lon, altitude: ZOOM_ALTITUDE }, 1200)
            window.setTimeout(() => onSelect(memory), 1200)
          }
        }
        return el
      }}
    />
  )
}
