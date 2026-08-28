import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import Globe from 'react-globe.gl'
import type { Destination } from '../destinations'
import type { Settings } from '../settings'
import { addBloom, sampleLandPoints, type GlobeInstance } from '../globeShared'

export const NAME = 'Donker puntenraster'

// No earth texture at all — the land is a dot matrix sampled from the mask,
// the register GitHub's globe works in. Pins are real Object3Ds (proving the
// research claim that pin rendering is fully replaceable), lit hot so the
// bloom pass catches them.
// Coincident pins: ONE marker per coordinate carrying a count, which is the
// "one pin per Destination, chooser when it holds more than one" answer
// from issue #11 — visible here rather than argued on paper.

type Group = { key: string; lat: number; lng: number; items: Destination[] }

export function VariantC({
  data, selected, onSelect, settings,
}: { data: Destination[]; selected: Destination | null; onSelect: (d: Destination) => void; settings: Settings }) {
  const ref = useRef<GlobeInstance | null>(null)
  const [land, setLand] = useState<{ lat: number; lng: number }[]>([])
  const [chooser, setChooser] = useState<Group | null>(null)

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>()
    for (const d of data) {
      const key = `${d.lat.toFixed(2)},${d.lng.toFixed(2)}`
      const g = m.get(key) ?? { key, lat: d.lat, lng: d.lng, items: [] }
      g.items.push(d)
      m.set(key, g)
    }
    return [...m.values()]
  }, [data])

  useEffect(() => {
    sampleLandPoints(1.15).then(setLand).catch(() => setLand([]))
  }, [])

  useEffect(() => {
    const g = ref.current
    if (!g) return
    // Threshold matters more than strength here: too low and the land dots bloom
    // too, and ~20 European markers merge into one white blob.
    if (settings.bloom) addBloom(g, { strength: 0.75, radius: 0.42, threshold: 0.62 }, settings.msaa)
    g.renderer().setPixelRatio(settings.fullDpr ? window.devicePixelRatio : 1)
    const c = g.controls()
    c.autoRotate = settings.autoRotate
    c.autoRotateSpeed = 0.22
    c.enableDamping = true
    c.minDistance = 140
    c.maxDistance = 520
  }, [])

  useEffect(() => {
    if (selected) ref.current?.pointOfView({ lat: selected.lat, lng: selected.lng, altitude: 0.85 }, 1200)
  }, [selected])

  return (
    <>
      <Globe
        ref={ref as never}
      onGlobeReady={() => ref.current?.pointOfView({ lat: 48, lng: 9, altitude: 1.35 }, 0)}
        backgroundColor="#000208"
        showGlobe={true}
        showAtmosphere={false}
        globeMaterial={useMemo(
          () => new THREE.MeshBasicMaterial({ color: '#050b16' }) as never,
          [],
        )}
        pointsData={land}
        pointLat={(d: object) => (d as { lat: number }).lat}
        pointLng={(d: object) => (d as { lng: number }).lng}
        pointColor={() => '#27607f'}
        pointAltitude={0.009}
        pointRadius={0.26}
        pointsMerge={true}
        objectsData={groups}
        objectLat={(d: object) => (d as Group).lat}
        objectLng={(d: object) => (d as Group).lng}
        objectAltitude={0.012}
        objectThreeObject={(raw: object) => {
          const g = raw as Group
          const node = new THREE.Group()
          const core = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 12, 12),
            new THREE.MeshBasicMaterial({ color: '#ffd9a0' }),
          )
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(g.items.length > 1 ? 1.7 : 1.15, 0.12, 8, 32),
            new THREE.MeshBasicMaterial({ color: g.items.length > 1 ? '#ffb347' : '#7fc7ff' }),
          )
          ring.lookAt(0, 0, 0)
          node.add(core, ring)
          return node
        }}
        onObjectClick={(raw: object) => {
          const g = raw as Group
          if (g.items.length > 1) setChooser(g)
          else onSelect(g.items[0])
        }}
      />

      {chooser && (
        <div
          onClick={() => setChooser(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 18, display: 'grid', placeItems: 'center',
            background: 'rgba(0,2,8,.72)', backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            {chooser.items.map((d) => (
              <button
                key={d.id}
                onClick={() => { onSelect(d); setChooser(null) }}
                style={{
                  border: 0, background: 'transparent', cursor: 'pointer', padding: 0,
                  color: '#fff', font: '600 13px/1.4 -apple-system, system-ui, sans-serif',
                }}
              >
                <img src={d.cover} style={{ width: 128, height: 128, borderRadius: 16, objectFit: 'cover', display: 'block', boxShadow: '0 0 30px rgba(127,199,255,.35)' }} />
                <div style={{ marginTop: 8 }}>{d.memory}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && !chooser && (
        <div
          style={{
            position: 'fixed', zIndex: 15, left: '50%', transform: 'translateX(-50%)',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 74px)',
            display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px 9px 9px',
            borderRadius: 999, background: 'rgba(10,18,32,.82)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(127,199,255,.22)',
            font: '13px/1.3 -apple-system, system-ui, sans-serif', color: '#e8f1ff',
          }}
        >
          <img src={selected.cover} style={{ width: 40, height: 40, borderRadius: 999, objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 700 }}>{selected.memory}</div>
            <div style={{ opacity: 0.55, marginTop: 1 }}>{selected.name}</div>
          </div>
        </div>
      )}
    </>
  )
}
