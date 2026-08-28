import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import type { Destination } from '../destinations'
import type { Settings } from '../settings'
import { TEX } from '../globeShared'

export const NAME = 'Zelfgebouwd (= A)'

// Deliberately the same look as variant A — night earth, glowing photo pins,
// same opening frame, same rotate-and-zoom — but hand-written on three.js
// instead of globe.gl. The point is a like-for-like comparison, so anything
// that differs here is a difference Marco can see and name.
//
// What it buys, per the research: none of the heatmap/hex-bin machinery,
// full control of the render pipeline (including the colour-space handling
// globe.gl's composer omits), and an easing curve that is ours.

const R = 100
const HOME = { lat: 47, lng: 9, altitude: 0.78 }

/** globe.gl's own convention, so coordinates match variant A exactly. */
function toVec3(lat: number, lng: number, alt = 0): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lng + 180) * Math.PI) / 180
  const r = R * (1 + alt)
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  )
}

/**
 * THE POINT OF THIS VARIANT. globe.gl hardcodes Easing.Cubic.InOut and only
 * lets you set the duration. This is quintic in-out: it leaves and arrives
 * more gently, with a longer settle. Swap it and feel the difference — that
 * is the freedom the library does not give you.
 */
const EASE = (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2)
const FLY_MS = 1200

export function VariantD({
  data,
  selected,
  onSelect,
  settings,
}: {
  data: Destination[]
  selected: Destination | null
  onSelect: (d: Destination) => void
  settings: Settings
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const api = useRef<{ flyTo: (lat: number, lng: number) => void } | null>(null)

  useEffect(() => {
    const el = host.current!
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#04070f')

    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 4000)
    camera.position.copy(toVec3(HOME.lat, HOME.lng, HOME.altitude))

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(settings.fullDpr ? window.devicePixelRatio : 1)
    renderer.setSize(el.clientWidth, el.clientHeight)
    // globe.gl's composer does no colour management at all; here we own it.
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.cssText = 'display:block;touch-action:none'
    el.appendChild(renderer.domElement)

    // --- the earth -------------------------------------------------------
    const loader = new THREE.TextureLoader()
    const map = loader.load(TEX.night)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = renderer.capabilities.getMaxAnisotropy()
    const bump = loader.load(TEX.topology)
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshPhongMaterial({ map, bumpMap: bump, bumpScale: 6, shininess: 0.1 }),
    )
    scene.add(globe)
    scene.add(new THREE.AmbientLight(0xffffff, 2.15))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(1, 0.6, 1).multiplyScalar(400)
    scene.add(key)

    // --- controls --------------------------------------------------------
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.enablePan = false
    controls.minDistance = R * 1.08
    controls.maxDistance = R * 5
    controls.autoRotate = settings.autoRotate
    controls.autoRotateSpeed = 0.28
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.7

    // --- post ------------------------------------------------------------
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    if (settings.bloom) {
      composer.addPass(
        new UnrealBloomPass(new THREE.Vector2(el.clientWidth, el.clientHeight), 0.85, 0.6, 0.2),
      )
      // Owning the pipeline means we can close it correctly. This is the pass
      // that double-encoded inside globe.gl's composer; here it belongs,
      // because the working colour space is ours to declare.
      composer.addPass(new OutputPass())
      if (settings.msaa) {
        for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
          rt.samples = 4
          rt.dispose()
        }
      }
    }

    // --- pins (DOM, projected every frame) -------------------------------
    const layer = document.createElement('div')
    layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'
    el.appendChild(layer)

    const pins = data.map((d) => {
      const node = document.createElement('div')
      node.style.cssText =
        'position:absolute;top:0;left:0;pointer-events:auto;cursor:pointer;will-change:transform,opacity'
      node.innerHTML = [
        '<div style="width:46px;height:46px;border-radius:50%;overflow:hidden;margin-left:-23px;',
        'border:2px solid rgba(255,255,255,.9);',
        'box-shadow:0 0 16px rgba(120,180,255,.55), 0 4px 12px rgba(0,0,0,.6);">',
        '<img src="' + d.cover + '" style="width:100%;height:100%;object-fit:cover;display:block" />',
        '</div>',
        '<div style="margin-top:5px;text-align:center;color:#fff;transform:translateX(-50%);',
        'font:600 10px/1.2 -apple-system,system-ui,sans-serif;',
        'text-shadow:0 1px 4px rgba(0,0,0,.95);white-space:nowrap">' + d.name + '</div>',
      ].join('')
      node.onclick = () => onSelect(d)
      layer.appendChild(node)
      return {
        node,
        pos: toVec3(d.lat, d.lng, 0.05),
        normal: toVec3(d.lat, d.lng, 0).normalize(),
      }
    })

    const proj = new THREE.Vector3()
    const toCam = new THREE.Vector3()
    function placePins() {
      const w = el.clientWidth
      const h = el.clientHeight
      for (const p of pins) {
        // Hide pins on the far side: the globe is opaque, so they must not
        // float over it. globe.gl does the same with a visibility callback.
        toCam.copy(camera.position).sub(p.pos).normalize()
        const facing = p.normal.dot(toCam)
        if (facing <= 0.02) {
          p.node.style.opacity = '0'
          p.node.style.pointerEvents = 'none'
          continue
        }
        proj.copy(p.pos).project(camera)
        p.node.style.opacity = String(Math.min(1, facing * 4))
        p.node.style.pointerEvents = 'auto'
        // Nearer pins on top. globe.gl sorts its HTML layer by depth; a plain
        // DOM layer stacks in document order, which reads as a bug.
        // x100, because at this zoom every pin is within a unit of the same
        // distance and integer z-indices all collapse onto each other.
        p.node.style.zIndex = String(90000 - Math.round(camera.position.distanceTo(p.pos) * 100))
        p.node.style.transform =
          'translate(' + (proj.x * 0.5 + 0.5) * w + 'px,' + (-proj.y * 0.5 + 0.5) * h + 'px)'
      }
    }

    // --- fly-to ----------------------------------------------------------
    let fly: { from: THREE.Spherical; to: THREE.Spherical; t0: number } | null = null
    api.current = {
      flyTo(lat, lng) {
        const from = new THREE.Spherical().setFromVector3(camera.position)
        const target = toVec3(lat, lng, 0).normalize().multiplyScalar(from.radius)
        const to = new THREE.Spherical().setFromVector3(target)
        // Shortest way round, so it never takes the long way about.
        while (to.theta - from.theta > Math.PI) to.theta -= Math.PI * 2
        while (to.theta - from.theta < -Math.PI) to.theta += Math.PI * 2
        fly = { from, to, t0: performance.now() }
      },
    }

    const onResize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    let raf = 0
    const tick = () => {
      if (fly) {
        const k = Math.min(1, (performance.now() - fly.t0) / FLY_MS)
        const e = EASE(k)
        camera.position.setFromSpherical(
          new THREE.Spherical(
            fly.from.radius,
            fly.from.phi + (fly.to.phi - fly.from.phi) * e,
            fly.from.theta + (fly.to.theta - fly.from.theta) * e,
          ),
        )
        camera.lookAt(0, 0, 0)
        if (k >= 1) fly = null
      }
      controls.update()
      placePins()
      composer.render()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      composer.dispose()
      renderer.dispose()
      globe.geometry.dispose()
      ;(globe.material as THREE.Material).dispose()
      map.dispose()
      bump.dispose()
      el.removeChild(renderer.domElement)
      el.removeChild(layer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (selected) api.current?.flyTo(selected.lat, selected.lng)
  }, [selected])

  return <div ref={host} style={{ position: 'fixed', inset: 0 }} />
}
