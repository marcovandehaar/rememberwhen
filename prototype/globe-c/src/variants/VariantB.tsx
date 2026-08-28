import { useEffect, useMemo, useRef } from 'react'
import Globe from 'react-globe.gl'
import type { Destination } from '../destinations'
import type { Settings } from '../settings'
import { matteGlobeMaterial, type GlobeInstance } from '../globeShared'

// Opening frame: Europe fills the view, because most Memories are there.
// Trips further afield (US, Canada, Vietnam) sit past the limb and need a
// drag to reach — a real consequence of this framing (issue #7).
const HOME = { lat: 47, lng: 9, altitude: 0.78 }

export const NAME = 'Mat papier'

// No photography at all: a two-tone globe from the land/sea mask, flat light,
// no atmosphere, no bloom. Names are always readable; the cover photo is not
// on the globe but in a panel, so the globe stays a map and not a mood board.
// Coincident pins: deliberately left colliding, so the problem is visible.

export function VariantB({
  data, selected, onSelect, settings,
}: { data: Destination[]; selected: Destination | null; onSelect: (d: Destination) => void; settings: Settings }) {
  const ref = useRef<GlobeInstance | null>(null)
  const material = useMemo(() => matteGlobeMaterial('#e8e2d4', '#9fb2bd'), [])

  useEffect(() => {
    const g = ref.current
    if (!g) return
    g.renderer().setPixelRatio(settings.fullDpr ? window.devicePixelRatio : 1)
    const c = g.controls()
    c.autoRotate = settings.autoRotate
    c.enableDamping = true
    c.minDistance = 150
    c.maxDistance = 460
  }, [])

  useEffect(() => {
    const g = ref.current
    if (!selected || !g) return
    // Keep the viewer's zoom level: flying to a pin should move the camera,
    // not re-frame the globe underneath them.
    const { altitude } = g.pointOfView()
    g.pointOfView({ lat: selected.lat, lng: selected.lng, altitude }, 1200)
  }, [selected])

  return (
    <>
      <Globe
        ref={ref as never}
      onGlobeReady={() => ref.current?.pointOfView(HOME, 0)}
        globeMaterial={material as never}
        backgroundColor="#f4f1ea"
        showAtmosphere={false}
        labelsData={data}
        labelLat={(d: object) => (d as Destination).lat}
        labelLng={(d: object) => (d as Destination).lng}
        labelText={(d: object) => (d as Destination).name}
        labelSize={1.35}
        labelDotRadius={0.42}
        labelColor={() => '#1c2b33'}
        labelResolution={3}
        labelAltitude={0.008}
        onLabelClick={(d: object) => onSelect(d as Destination)}
      />
      {selected && (
        <div
          style={{
            position: 'fixed', zIndex: 15, left: 0, right: 0,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 74px)',
            display: 'flex', justifyContent: 'center', pointerEvents: 'none',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 10,
              background: '#fffdf8', borderRadius: 12, boxShadow: '0 8px 30px rgba(40,50,60,.28)',
              font: '13px/1.3 -apple-system, system-ui, sans-serif', color: '#1c2b33',
            }}
          >
            <img src={selected.cover} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} />
            <div>
              <div style={{ fontWeight: 700 }}>{selected.memory}</div>
              <div style={{ opacity: 0.6, marginTop: 2 }}>{selected.name}</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
