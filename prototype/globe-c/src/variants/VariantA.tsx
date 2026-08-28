import { useEffect, useRef } from 'react'
import Globe from 'react-globe.gl'
import type { Destination } from '../destinations'
import type { Settings } from '../settings'
import { addBloom, TEX, type GlobeInstance } from '../globeShared'

// Opening frame: Europe fills the view, because most Memories are there.
// Trips further afield (US, Canada, Vietnam) sit past the limb and need a
// drag to reach — a real consequence of this framing (issue #7).
const HOME = { lat: 47, lng: 9, altitude: 0.78 }

export const NAME = 'Fotografisch nacht'

// Photographic earth at night, pins are the cover photo itself.
// Coincident pins: fanned apart in screen space so both are always tappable.

export function VariantA({
  data, selected, onSelect, settings,
}: { data: Destination[]; selected: Destination | null; onSelect: (d: Destination) => void; settings: Settings }) {
  const ref = useRef<GlobeInstance | null>(null)

  useEffect(() => {
    const g = ref.current
    if (!g) return
    if (settings.bloom) addBloom(g, { strength: 0.85, radius: 0.6, threshold: 0.2 }, settings.msaa)
    g.renderer().setPixelRatio(settings.fullDpr ? window.devicePixelRatio : 1)
    const c = g.controls()
    c.autoRotate = settings.autoRotate
    c.autoRotateSpeed = 0.28
    c.enableDamping = true
    c.minDistance = 130
    c.maxDistance = 500
  }, [])

  useEffect(() => {
    if (selected) ref.current?.pointOfView({ lat: selected.lat, lng: selected.lng, altitude: 0.9 }, 1200)
  }, [selected])

  // Fan pins that share a coordinate.
  const offsets = new Map<string, number>()
  const seen = new Map<string, number>()
  for (const d of data) {
    const k = `${d.lat.toFixed(2)},${d.lng.toFixed(2)}`
    const n = seen.get(k) ?? 0
    seen.set(k, n + 1)
    offsets.set(d.id, n)
  }

  return (
    <Globe
      ref={ref as never}
      onGlobeReady={() => ref.current?.pointOfView(HOME, 0)}
      globeImageUrl={TEX.night}
      bumpImageUrl={TEX.topology}
      backgroundColor="#04070f"
      showAtmosphere={false}
      htmlElementsData={data}
      htmlLat={(d: object) => (d as Destination).lat}
      htmlLng={(d: object) => (d as Destination).lng}
      htmlAltitude={0.05}
      htmlElement={(raw: object) => {
        const d = raw as Destination
        const fan = offsets.get(d.id) ?? 0
        const el = document.createElement('div')
        el.style.cssText = `transform: translate(${fan * 30 - (seen.get(`${d.lat.toFixed(2)},${d.lng.toFixed(2)}`)! - 1) * 15}px, 0); cursor: pointer; pointer-events: auto;`
        el.innerHTML = `
          <div style="width:46px;height:46px;border-radius:50%;overflow:hidden;
                      border:2px solid rgba(255,255,255,.9);
                      box-shadow:0 0 16px rgba(120,180,255,.55), 0 4px 12px rgba(0,0,0,.6);">
            <img src="${d.cover}" style="width:100%;height:100%;object-fit:cover;display:block" />
          </div>
          <div style="margin-top:5px;text-align:center;color:#fff;font:600 10px/1.2 -apple-system,system-ui,sans-serif;
                      text-shadow:0 1px 4px rgba(0,0,0,.95);white-space:nowrap">${d.name}</div>`
        el.onclick = () => onSelect(d)
        return el
      }}
    />
  )
}
