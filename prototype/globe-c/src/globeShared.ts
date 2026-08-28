import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export const TEX = {
  night: '//unpkg.com/three-globe/example/img/earth-night.jpg',
  day: '//unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  water: '//unpkg.com/three-globe/example/img/earth-water.png',
  topology: '//unpkg.com/three-globe/example/img/earth-topology.png',
}

/** Rough globe.gl instance surface — the accessors the research said are public. */
export type GlobeInstance = {
  scene: () => THREE.Scene
  camera: () => THREE.Camera
  renderer: () => THREE.WebGLRenderer
  controls: () => { autoRotate: boolean; autoRotateSpeed: number; enableDamping: boolean; minDistance: number; maxDistance: number }
  postProcessingComposer: () => EffectComposer
  pointOfView: {
    /** getter: the camera where it is now */
    (): { lat: number; lng: number; altitude: number }
    (pov: { lat: number; lng: number; altitude?: number }, ms?: number): void
  }
  lights: () => THREE.Light[]
}

/**
 * Add one bloom pass to globe.gl's own composer.
 *
 * NOTE (issue #7): this is the pass that costs MSAA. With only a RenderPass,
 * renderToScreen draws into the antialiased default framebuffer; the moment a
 * second pass exists the composer writes into its own HalfFloatType target,
 * created with no `samples`. We re-create the targets with samples below to
 * claw the antialiasing back — which is exactly the "you end up writing the
 * interesting half of a bespoke globe anyway" point. Watch the silhouette on
 * the iPad with this commented out to see the difference.
 */
export function addBloom(
  g: GlobeInstance,
  { strength = 1.1, radius = 0.55, threshold = 0.12 } = {},
  msaa = true,
) {
  const composer = g.postProcessingComposer()
  const size = g.renderer().getSize(new THREE.Vector2())
  const bloom = new UnrealBloomPass(size, strength, radius, threshold)
  composer.addPass(bloom)
  // NOTE (issue #7): adding OutputPass here DOUBLE-ENCODES the colour space.
  // globe.gl's renderer already outputs sRGB, so OutputPass lifts every black
  // to grey and fogs the whole frame. Left out deliberately; this is a real
  // trap in globe.gl's composer, not a three.js bug.

  // Prime suspect for BOTH iPad symptoms (issue #7): a multisampled
  // HalfFloatType target may be resolving expensively on Apple GPU, and may
  // be what lifts the background. Toggle it on the device to find out.
  if (msaa) {
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      rt.samples = 4
      rt.dispose()
    }
  }
  return bloom
}

/** Matte two-tone earth: land/sea from the water mask, no photography. */
export function matteGlobeMaterial(landColor: string, seaColor: string) {
  const mask = new THREE.TextureLoader().load(TEX.water)
  mask.colorSpace = THREE.NoColorSpace
  return new THREE.ShaderMaterial({
    uniforms: {
      mask: { value: mask },
      land: { value: new THREE.Color(landColor) },
      sea: { value: new THREE.Color(seaColor) },
      lightDir: { value: new THREE.Vector3(0.6, 0.35, 0.7).normalize() },
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN;
      void main() {
        vUv = uv;
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D mask; uniform vec3 land; uniform vec3 sea; uniform vec3 lightDir;
      varying vec2 vUv; varying vec3 vN;
      void main() {
        // In earth-water.png water is white, land is black.
        float water = texture2D(mask, vUv).r;
        float isLand = 1.0 - smoothstep(0.35, 0.65, water);
        vec3 base = mix(sea, land, isLand);
        // Deliberately flat: a wide wrap so it reads as paper, not as a planet.
        float lambert = clamp(dot(vN, lightDir) * 0.5 + 0.72, 0.0, 1.0);
        gl_FragColor = vec4(base * lambert, 1.0);
      }`,
  })
}

/**
 * Sample the water mask into a lat/lng dot matrix over land only.
 * unpkg sends `Access-Control-Allow-Origin: *`, so the canvas stays untainted
 * and getImageData works — the very origin-taint rule that ruled canvas
 * compositing out for the story renderer.
 */
export function sampleLandPoints(stepDeg = 2.2): Promise<{ lat: number; lng: number }[]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => reject(new Error('land mask failed to load'))
    img.onload = () => {
      const w = 1024
      const h = 512
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      const pts: { lat: number; lng: number }[] = []
      for (let lat = -84; lat <= 84; lat += stepDeg) {
        // Keep dot density even in screen space rather than in degrees.
        const lngStep = stepDeg / Math.max(0.22, Math.cos((lat * Math.PI) / 180))
        for (let lng = -180; lng < 180; lng += lngStep) {
          const x = Math.floor(((lng + 180) / 360) * w)
          const y = Math.floor(((90 - lat) / 180) * h)
          if (data[(y * w + x) * 4] < 90) pts.push({ lat, lng })
        }
      }
      resolve(pts)
    }
    img.src = TEX.water
  })
}
