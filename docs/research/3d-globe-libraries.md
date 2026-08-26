# Interactive 3D globes with pins on the web, and their visual ceiling

Research note for issue #3. Written 2026-08-26. "Latest at the time of writing" means: three.js
r185.1, globe.gl 2.46.2, three-globe 2.45.2, react-globe.gl 2.38.0, r3f-globe 1.6.0, cobe 2.0.1,
@react-three/fiber 9.7.0, @react-three/drei 10.7.8, maplibre-gl 6.6.0, mapbox-gl 3.29.0,
cesium 1.144.0, deck.gl 9.3.10, 3d-tiles-renderer 0.5.2 — all read from the npm registry on
2026-08-26. Every claim below links to the source that owns it; anything I could not establish from
a primary source is marked **[UNESTABLISHED]**, and reasoning of my own is marked **inference** or
**opinion**.

Two things this note deliberately does not do. It does not tell you whether anything *looks* good —
per the map's Notes, that judgement is Marco's, so where a visual verdict is needed I give a live
URL to look at instead. And it does not give frame rates: **real-device iPad frame rate cannot be
established by reading**, only by running the thing on the iPad.

## The question

`rememberwhen`'s opening screen is an interactive 3D globe with ~20 pins, one per travel
`Destination`. Tapping a pin animates a rotate-and-zoom to that destination and opens its story.
It is the first thing anyone sees, and it has to look stunning, not merely work.

What exists today for an interactive 3D globe with pins on the web, and is any of it good enough to
be that opening screen? For each candidate: what is its *ceiling*, not its default — how far can its
rendering be replaced or extended without forking?

## Verdict

**Three real candidates survive, and they are all three.js underneath.** Everything that is not
three.js is out for a reason that is not about taste: cobe cannot zoom or hit-test, MapLibre and
Mapbox are map engines whose globe is a projection rather than an object, Cesium is a 6 MB
geospatial platform, deck.gl's `_GlobeView` is explicitly experimental and cannot rotate the camera,
and the Google/Cesium photorealistic tile paths bill per request and require an account.

**globe.gl's ceiling is much higher than its examples suggest, and its floor is much more expensive
than its README suggests.** The escape hatches are real and typed: `.scene()`, `.camera()`,
`.renderer()`, `.controls()`, `.postProcessingComposer()` and `.lights()` are all public accessors
([`globe.gl/src/index.d.ts`](https://github.com/vasturiano/globe.gl/blob/master/src/index.d.ts)),
`globeMaterial()` swaps the earth's material for anything you like including a custom `ShaderMaterial`
([`three-globe/src/layers/globe.js`](https://github.com/vasturiano/three-globe/blob/master/src/layers/globe.js)),
`showAtmosphere(false)` turns the built-in glow off, and pins can be **arbitrary `Object3D`s**
(`objectThreeObject`) or **arbitrary DOM elements** (`htmlElement`), which is exactly what a cover
thumbnail pin needs. You are not stuck with the demo globe.

But: **I measured globe.gl at 540 KB gzipped against 138 KB for a hand-written three.js globe** —
a real esbuild production bundle, not a bundlephobia estimate. 627 KB of that (minified) is
`three.webgpu.js`, pulled in because `three-globe` statically imports `three/webgpu` and `three/tsl`
for one GPU-compute path in the *heatmaps* layer, plus 209 KB of `h3-js` for the *hex-bin* layer.
None of it is reachable from a globe with twenty pins. **Two thirds of globe.gl's weight is features
this app will never use, and it is not tree-shakeable.**

Two further ceilings are worth knowing before you commit. **The rotate-and-zoom easing is hardcoded**
to `Easing.Cubic.InOut` in `pointOfView()` — the duration is a parameter, the curve is not
([`globe.js`](https://github.com/vasturiano/globe.gl/blob/master/src/globe.js)). And
**the moment you add a bloom pass, you lose MSAA**: globe.gl always renders through an
`EffectComposer`, whose default buffer is a `HalfFloatType` render target with no `samples`, so the
globe's silhouette will alias unless you also add your own AA pass. Both are workable — you can drive
the exposed camera and controls yourself, and you can hand the composer your own multisampled target —
but at that point you are writing the interesting half of a bespoke globe anyway.

**My recommendation, labelled opinion: prototype bespoke three.js first, with globe.gl as the
control.** The bespoke surface for this app is genuinely small — a sphere, a lat/lng→Vector3 helper,
one `Raycaster` for twenty pins, `camera-controls` for touch and awaitable camera transitions, and
whatever material makes the earth look the way Marco wants. three.js and drei already supply every
piece except the material and the choreography, and those two are precisely the parts that decide
whether it looks stunning — so they are the parts you cannot outsource to a library in any case.
The strongest visual evidence in this whole note is that **GitHub's globe, the one everyone tries to
copy, was bespoke three.js with no textures at all**: "we point four lights at a sphere, use about
12,000 five-sided circles to render the Earth's regions, and draw a halo with a simple custom shader"
([GitHub engineering blog](https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/)).

The `Zillertal 2024` / `Zillertal 2026` problem is **not a library-selection question**. No candidate
in the three.js family offers clustering or spiderfy; MapLibre's built-in clustering only applies to
style layers, not to DOM markers. With twenty pins the honest answer is that this is a design
decision (one pin per `Destination` opening a chooser, or a small authored offset) and it costs
roughly the same in every candidate.

---

## 1. How the numbers in this note were produced

Bundle sizes are measured, not looked up. In a scratch directory I installed each package at the
version listed above and bundled a realistic entry point with esbuild 0.28.2
(`--bundle --minify --format=esm --define:process.env.NODE_ENV='"production"'`), then compressed the
output with `gzip -9` and Node's `zlib.brotliCompressSync`. Composition figures come from esbuild's
`--metafile`, aggregated per npm package.

Caveat: a Vite/Rollup production build may differ slightly. Where the difference would matter —
`three/webgpu` inside `three-globe` — I checked the reason in the shipped source rather than trusting
the bundler, and it is an unconditional top-level `import` from a module the `ThreeGlobe` constructor
reaches, so no ESM-correct bundler can drop it.

Package metadata (versions, publish dates, licences, dependency vs. peer dependency) comes from the
npm registry API; repository activity from the GitHub API.

## 2. The three-globe family: globe.gl, react-globe.gl, r3f-globe

One engine, three wrappers. [`three-globe`](https://github.com/vasturiano/three-globe) is an
`Object3D` subclass that owns all the layers. [`globe.gl`](https://github.com/vasturiano/globe.gl)
wraps it together with [`three-render-objects`](https://github.com/vasturiano/three-render-objects)
to supply a renderer, camera, controls and raycasting.
[`react-globe.gl`](https://github.com/vasturiano/react-globe.gl) is a React binding over globe.gl.
[`r3f-globe`](https://github.com/vasturiano/r3f-globe) drops `three-globe` into an existing
react-three-fiber `<Canvas>` and leaves the renderer and camera to you.

All maintained by Vasco Asturiano; all MIT. Activity as of 2026-08-26 (GitHub API `pushed_at`):
globe.gl 2026-08-22 (3151 ★), three-globe 2026-04-04 (1616 ★), react-globe.gl 2026-05-16 (1448 ★),
r3f-globe 2025-10-31 (53 ★). **r3f-globe is the one to be careful with** — ten months since the last
push and 53 stars is a different maintenance profile from the others.

### 2.1 What it actually renders

The earth is a plain `SphereGeometry` with a `MeshPhongMaterial`, and the "texture" is your
equirectangular image assigned to `material.map`:

- geometry: `new THREE.SphereGeometry(GLOBE_RADIUS, widthSegments, widthSegments / 2)` where
  `widthSegments = Math.round(360 / globeCurvatureResolution)` and `globeCurvatureResolution`
  defaults to `4` — so **90 × 45 segments by default**
  ([globe.js](https://github.com/vasturiano/three-globe/blob/master/src/layers/globe.js)).
- material: `new THREE.MeshPhongMaterial({ color: 0x000000 })`, with `map`, `bumpMap` and
  `specularMap` filled in from the URLs you supply (ibid.).
- lights, set by globe.gl: one `AmbientLight(0xcccccc, Math.PI)` and one
  `DirectionalLight(0xffffff, 0.6 * Math.PI)`
  ([globe.js](https://github.com/vasturiano/globe.gl/blob/master/src/globe.js)).
- atmosphere: a `GlowMesh` — a back-side hollow sphere with a hand-written Fresnel-ish shader,
  `intensity = pow(coefficient + dot(N, V), power)`, constructed with `coefficient: 0.1,
  power: 3.5` **hardcoded**; only `atmosphereColor` and `atmosphereAltitude` are exposed
  ([GlowMesh.js](https://github.com/vasturiano/three-globe/blob/master/src/utils/GlowMesh.js),
  [globe.js](https://github.com/vasturiano/three-globe/blob/master/src/layers/globe.js)).
- the canonical earth texture shipped in the examples is **4096 × 2048, 1.43 MB JPEG**
  (`three-globe/example/img/earth-blue-marble.jpg`, measured from the installed package).

So the default look is: Phong-shaded sphere, one directional light, one fake rim glow. That is the
"demo globe" the ticket is worried about — and it is entirely replaceable.

### 2.2 The escape hatches, verified

These are all in the published typings, not folklore
([`globe.gl/src/index.d.ts`](https://github.com/vasturiano/globe.gl/blob/master/src/index.d.ts)):

```ts
lights(): Light[];              lights(lights: Light[]): ChainableInstance;
scene(): Scene;
camera(): Camera;
renderer(): WebGLRenderer;
postProcessingComposer(): EffectComposer;
controls(): OrbitControls;
```

`scene`, `camera`, `renderer` and `controls` are one-line pass-throughs to `three-render-objects`
([globe.js](https://github.com/vasturiano/globe.gl/blob/master/src/globe.js)), and
`postProcessingComposer` is exposed there too
([three-render-objects.js](https://github.com/vasturiano/three-render-objects/blob/master/src/three-render-objects.js)).

From `three-globe`'s typings, inherited by globe.gl
([`three-globe/src/index.d.ts`](https://github.com/vasturiano/three-globe/blob/master/src/index.d.ts)):

```ts
globeMaterial(): Material;      globeMaterial(m: Material): ChainableInstance;
showGlobe(show: boolean);       showAtmosphere(show: boolean);
atmosphereColor(c: string);     atmosphereAltitude(a: number);
globeCurvatureResolution(res: number);
getCoords(lat, lng, altitude?): { x, y, z };
toGeoCoords({x,y,z}): { lat, lng, altitude };
```

`globeMaterial(m)` assigns straight onto the mesh: `state.globeObj.material = globeMaterial ||
state.defaultGlobeMaterial`. **A custom `ShaderMaterial` for the earth is a supported one-liner.**
The maintainer's own
[Custom Globe Styling example](https://vasturiano.github.io/globe.gl/example/custom-globe-styling/)
([source](https://github.com/vasturiano/globe.gl/blob/master/example/custom-globe-styling/index.html))
mutates `world.globeMaterial()` and repositions `world.lights()`.

The post-processing composer is **always** constructed and the render loop always calls it:

```js
state.postProcessingComposer = new ThreeEffectComposer(state.renderer);
state.postProcessingComposer.addPass(new ThreeRenderPass(state.scene, state.camera));
...
state.postProcessingComposer
  ? state.postProcessingComposer.render()
  : state.renderer.render(state.scene, state.camera);
```

([three-render-objects.js](https://github.com/vasturiano/three-render-objects/blob/master/src/three-render-objects.js)).
So `globe.postProcessingComposer().addPass(new UnrealBloomPass(...))` genuinely works.

**Where that bites — verified, and it matters for "stunning".** The renderer is created with
`{ antialias: true, alpha: true }` and `setPixelRatio(Math.min(2, window.devicePixelRatio))`
([three-render-objects.js](https://github.com/vasturiano/three-render-objects/blob/master/src/three-render-objects.js)).
With only the `RenderPass` present, `EffectComposer` sets `pass.renderToScreen = true` for the last
enabled pass and `RenderPass` then calls `renderer.setRenderTarget(null)` — so it draws straight to
the antialiased default framebuffer and MSAA survives. **Add any second pass and it does not.** The
composer's auto-created buffer is
`new WebGLRenderTarget(w * dpr, h * dpr, { type: HalfFloatType })` with **no `samples`**
(`three/examples/jsm/postprocessing/EffectComposer.js`, constructor), so the RenderPass now writes
into a non-multisampled target and the globe's silhouette aliases. Fixable — pass your own
`WebGLRenderTarget` with `samples: 4`, or add an SMAA pass — but you have to know.

Arithmetic (not measured on device): on a 12.9" iPad Pro at CSS 1366 × 1024 and DPR 2, the composer's
two RGBA16F buffers are 2732 × 2048 × 8 bytes ≈ **44.8 MB each, 89.5 MB for the pair**, on top of a
4096 × 2048 RGBA earth texture at 33.6 MB (≈44.8 MB with mipmaps) and a same-size night-sky
background at another ≈44.8 MB. A bloom-enabled globe.gl scene is therefore on the order of
**180 MB of GPU-side memory** before you have added a single pin.

### 2.3 Pins

Three usable mechanisms, all verified in source and typings:

| Mechanism | What you get | Source |
|---|---|---|
| `pointsData` + `pointColor`/`pointRadius`/`pointAltitude` | cylinders rising from the surface; `pointsMerge` merges them into one mesh | `three-globe` points layer |
| `objectsData` + `objectThreeObject(d => Object3D)` | **arbitrary three.js object per datum**, wrapped in a `Group`, positioned by `polar2Cartesian`, optionally oriented to face the surface (`objectFacesSurface`) | [objects.js](https://github.com/vasturiano/three-globe/blob/master/src/layers/objects.js) |
| `htmlElementsData` + `htmlElement(d => HTMLElement)` | **arbitrary DOM per datum** via `CSS2DObject`, plus `htmlElementVisibilityModifier(el, isVisible)` to fade elements on the far side | [htmlElements.js](https://github.com/vasturiano/three-globe/blob/master/src/layers/htmlElements.js) |

`customLayerData` + `customThreeObject` + `customThreeObjectUpdate` is a fourth, lower-level variant
where you own positioning entirely
([example](https://github.com/vasturiano/globe.gl/blob/master/example/custom-layer/index.html)).

For "a pin with a chosen cover thumbnail", both of the interesting routes are open. **DOM markers**
give you an `<img>` with CSS — border radius, shadow, `filter`, transitions, and a real `onclick` —
positioned by `CSS2DRenderer` as an overlay; globe.gl wires that renderer in as an `extraRenderer`
([globe.js](https://github.com/vasturiano/globe.gl/blob/master/src/globe.js)). The
[HTML Markers example](https://vasturiano.github.io/globe.gl/example/html-markers/) is exactly this
pattern. Trade-off: as an overlay, a DOM marker is not occluded by geometry — hence the explicit
visibility modifier for the far side. **`objectThreeObject`** instead gives you a real mesh (say a
rounded plane with the cover as a `Texture`), correctly depth-sorted, hit-tested by the built-in
raycaster, and free to receive your own shader.

Hit-testing: `onObjectClick` / `onPointClick` / `onCustomLayerClick` are all in the typings; the
raycast runs in `three-render-objects` via `raycaster.intersectObjects(state.objects, true)`, throttled
by `pointerRaycasterThrottleMs` (default 50 ms).

### 2.4 Camera animation

```ts
pointOfView(pov: { lat?, lng?, altitude? }, transitionMs?: number): ChainableInstance;
```

The implementation
([globe.js](https://github.com/vasturiano/globe.gl/blob/master/src/globe.js)):

```js
state.tweenGroup.add(state.povTween = new Tween(curGeoCoords)
  .to(finalGeoCoords, transitionDuration)
  .easing(Easing.Cubic.InOut)
  ...
```

**Duration is a parameter; easing is hardcoded to `Easing.Cubic.InOut` and is not exposed.** It does
do one nice thing for free: it normalises longitude so the camera never rotates more than 180°.

The workaround is real but is also the tell. Because `.camera()` and `.controls()` are public, you can
run your own tween — GSAP, `maath/easing`, whatever — and set the camera position yourself; you must
then also keep three-globe informed, since globe.gl reports the point of view to three-globe on every
`controls` `change` event via `state.globe.setPointOfView(camera)` (ibid., `init`).
**Inference:** driving the camera yourself while the library also reacts to `controls` events is
doable but is the kind of seam that produces judder, and it is the first thing to check in a spike.

Also note globe.gl calibrates OrbitControls opinionatedly on init: `enablePan = false`,
`enableDamping = true`, `dampingFactor = 0.1`, `zoomToCursor = true`, and `rotateSpeed` / `zoomSpeed`
recomputed from altitude on every change (ibid.). All mutable afterwards through `.controls()`.

### 2.5 Bundle cost (measured)

| Entry point | raw min | gzip | brotli |
|---|---|---|---|
| `import Globe from 'globe.gl'` | 1,912,126 | **540,162** | 427,464 |
| `r3f-globe` + `@react-three/fiber` + `drei` + `react` + `react-dom` | 2,320,723 | **667,295** | — |
| three.js subset for a bespoke globe + `OrbitControls` | 552,876 | **138,300** | 114,770 |
| same + `EffectComposer`/`RenderPass`/`UnrealBloomPass`/`OutputPass` | 572,665 | **142,717** | 118,000 |
| `@react-three/fiber` + `drei` (OrbitControls, useTexture, Html) + `react` + `react-dom` | 1,113,748 | **306,953** | 247,644 |
| `react` + `react-dom` alone (baseline to subtract) | 193,243 | **60,056** | — |
| `cobe` | 12,959 | **5,888** | 5,236 |
| `maplibre-gl` (`Map` + `Marker`) | 956,709 | **250,133** | 207,316 |

Composition of the globe.gl bundle (esbuild metafile, bytes in output, minified):

```
three         1307.7 KB   <- of which three.webgpu.js 627.1, three.module.js 341.1, three.core.js 250.4
h3-js          208.7 KB
three-globe    129.1 KB
d3-geo          23.1 KB
tinycolor2      15.1 KB
three-render-objects 13.6 KB
d3-selection    12.4 KB
globe.gl        12.4 KB
@tweenjs/tween.js 11.8 KB
polished        11.0 KB
d3-delaunay     10.8 KB
preact          10.7 KB   <- via float-tooltip
...
TOTAL         1867.3 KB
```

The cause is two unconditional top-level imports in the shipped `three-globe` bundle
(`dist/three-globe.mjs` lines 19–20):

```js
import { StorageInstancedBufferAttribute, WebGPURenderer } from 'three/webgpu';
import * as tsl from 'three/tsl';
```

used only by the **heatmaps** layer's GPU kernel-density path (`new WebGPURenderer()` appears twice
in that file), while `h3-js` serves the **hex-bin** layer. `three-globe`'s `package.json` declares
`"sideEffects": false`, but the `ThreeGlobe` class composes every layer, so the code is reachable and
stays.

Dependency shape, worth knowing:

- **globe.gl declares `three` as a regular `dependency`** (`">=0.179 <1"`), not a peer dependency
  ([package.json](https://github.com/vasturiano/globe.gl/blob/master/package.json)). npm will dedupe
  against your own `three` if the range is satisfied, but you no longer control the version.
- `three-globe` declares `three` as a **peerDependency** (`">=0.154"`), and so does `r3f-globe`
  (`three >= 0.154`, `react *`) — those two leave `three` to you.
- `react-globe.gl` peers on `react` only and depends on `globe.gl ^2.46`.

### 2.6 Where the family visibly breaks

- **Easing on `pointOfView` is not overridable** (§2.4).
- **Atmosphere shape is not tunable** — colour and altitude only; `coefficient` and `power` are
  literals in `three-globe`. You can turn it off with `showAtmosphere(false)` and add your own.
  **Inference (from source, not documented):** you could also walk `globe.scene()` for the child with
  `__globeObjType === 'atmosphere'` and replace its `.material`; the type tag is set in
  [globe.js](https://github.com/vasturiano/three-globe/blob/master/src/layers/globe.js).
- **MSAA is lost as soon as you add a post-processing pass** (§2.2).
- **Bundle weight is ~3× a bespoke globe** and cannot be trimmed (§2.5).
- Minor, but real: `three-render-objects` assigns `window.scene = state.scene` on init
  ([three-render-objects.js](https://github.com/vasturiano/three-render-objects/blob/master/src/three-render-objects.js)).
- `htmlElementsData` markers are DOM overlays, so they never occlude behind geometry; far-side hiding
  is a callback you write.

### 2.7 Shipped products

This is the weakest evidence in the note and I will not dress it up. **I could not verify a single
shipped consumer product built on globe.gl / three-globe that clears a high visual bar.** What exists:

- The maintainer's own gallery — [globe.gl examples](https://github.com/vasturiano/globe.gl#examples),
  ~30 live demos. These are data-visualisation demos, not product design.
- Secondary sources repeatedly claim GitHub's homepage globe was built with react-globe.gl. **That is
  false**: GitHub's own engineering post says three.js directly, with no textures
  ([github.blog](https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/)).
  A good illustration of why this note sticks to primary sources.
- [Aceternity UI's "GitHub Globe" component](https://ui.aceternity.com/components/github-globe) is
  widely cited as a react-globe.gl recreation; I could not read the component source from the public
  page, so **[UNESTABLISHED]**.

## 3. cobe

[shuding/cobe](https://github.com/shuding/cobe), MIT, 2.0.1 published 2026-03-19, last push
2026-07-18, 5676 ★ — comfortably the most-starred of the lot, and actively maintained.

**5.9 KB gzipped, measured.** Zero dependencies. That is not marketing: the entire published package
is ~19 KB unpacked.

### What it renders

Not a scene. A **single fragment shader on one quad**. `globe.frag.glslx` computes, per pixel, the
nearest point on a **spherical Fibonacci lattice** and samples a **256 × 128, ~1 KB** world map to
decide whether that dot is land, then applies Phong-ish shading plus a glow term. The author's own
write-up confirms the intent and the numbers: the previous three.js version needed a 40 KB texture
that "still felt blurry", so he downscaled a 4096 × 2048 map to 256 × 128 and inlined it as base64
([shud.in/thoughts/cobe](https://shud.in/thoughts/cobe)).

Markers are a second tiny shader: instanced quads, `if (length(vUV) > 0.25) discard;` — a flat
circle, one colour, one size (`marker.glslx`).

### Ceiling

**The dot matrix *is* the product.** There is no scene graph, no camera, no lights, no render loop you
can hook, no material to replace. The public API is the entire surface
([`src/index.d.ts`](https://github.com/shuding/cobe/blob/main/src/index.d.ts)):
`createGlobe(canvas, opts)` returning `{ update, destroy }`, with options
`phi, theta, scale, offset, mapSamples, mapBrightness, mapBaseBrightness, baseColor, markerColor,
glowColor, diffuse, dark, opacity, markers, arcs, arcColor, arcWidth, arcHeight, markerElevation`.

Fatal for this app, in order:

1. **No zoom and no perspective camera.** `phi`/`theta` rotate; `scale` and `offset` are 2D. There is
   no rotate-*and-zoom* to a destination, only rotate-and-resize.
2. **No hit-testing.** Nothing in the API maps a pointer position to a marker. You would compute the
   inverse projection yourself against the same maths the shader uses.
3. **Pins cannot be replaced with geometry.** A marker is a coloured disc; that is the whole shader.

The one genuinely interesting v2 feature for this app: **CSS anchor positioning**. Give a marker an
`id` and cobe exposes `--cobe-{id}` as an anchor name and `--cobe-visible-{id}` (0 behind the globe,
1 in front) as a custom property, so an arbitrary DOM label — a cover thumbnail — can be anchored to a
marker and cross-faded ([README](https://github.com/shuding/cobe#readme)). CSS Anchor
Positioning shipped in **Safari 26.0** and has been refined through 26.1, 26.2 and 26.5
([WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
[26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/),
[26.5](https://webkit.org/blog/17938/webkit-features-for-safari-26-5/)) — so it is available on a
current iPad, and absent on older iPadOS.

### Shipped products

The strongest adoption evidence of any candidate here:

- The author states cobe "now powers both vercel.com and vercel.com/edge"
  ([shud.in](https://shud.in/thoughts/cobe)). **Checked live on 2026-08-26: vercel.com's homepage no
  longer renders a globe** (one large hero canvas, not a globe), so treat that as historical.
- [Magic UI's `Globe` component](https://magicui.design/docs/components/globe) is built on cobe —
  verified live: the docs page renders a canvas and its props table documents `COBEOptions`.
- The library's own demo: [cobe.vercel.app](https://cobe.vercel.app).

**Opinion:** cobe is the best-looking *default* on this list and the lowest ceiling. If the design
that wins is "a small, matte, dotted globe that idles and slowly rotates", cobe is 5 KB and done. It
cannot be the opening screen described in issue #3, because that screen zooms.

## 4. Bespoke three.js

three.js r185.1, MIT, 114,806 ★, pushed the day this note was written. **Measured at 138 KB gzipped**
for the subset a globe needs plus `OrbitControls`; 143 KB with the full bloom post-processing chain.

### What is genuinely left to author

Honest accounting — what three.js/drei already gives you versus what you write:

| Piece | Already exists | You write |
|---|---|---|
| Sphere + texture | `SphereGeometry`, `TextureLoader`, `MeshStandardMaterial`, `KTX2Loader` | choosing/authoring the earth look |
| lat/lng → position | `Vector3.setFromSphericalCoords` / `Spherical` (three core) | ~5 lines of conversion |
| Pin hit-testing | `Raycaster.intersectObjects` | ~15 lines: pointer→NDC, raycast, map hit → `Destination` |
| Touch orbit + pinch | `OrbitControls` (one-finger rotate, two-finger dolly/pan) or `camera-controls` | choosing limits |
| Camera tween | `camera-controls` `rotateTo`/`dollyTo`/`setLookAt` with `enableTransition`, awaitable transitions, and an official [easing example driven by GSAP](https://yomotsu.github.io/camera-controls/examples/easing.html) | the choreography |
| Atmosphere | a 20-line Fresnel shader is the classic; or `@takram/three-atmosphere` for the real thing (§5) | the look |
| Bloom / grade | `EffectComposer` + `UnrealBloomPass` + `OutputPass`, or the `postprocessing` package | the settings |
| Perf guards | drei `AdaptiveDpr`, `PerformanceMonitor`, `DetectGPU`, `Bvh` | the thresholds |

**That is a small amount of authored code and a large amount of art direction.** For twenty pins there
is no scaling problem to solve: no instancing needed, no LOD, no clustering algorithm, one raycast per
tap. The parts a library saves you — arcs, hex bins, heatmaps, choropleths, tile engines — are
precisely the parts this app does not use.

### Evidence that bespoke reaches the bar

[How we built the GitHub globe](https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/)
is the best primary account available. Quoted specifics: "the globe runs in a WebGL context powered by
three.js"; "We don't use any textures: we point four lights at a sphere, use about 12,000 five-sided
circles to render the Earth's regions, and draw a halo with a simple custom shader"; arcs are
"instances of `TubeBufferGeometry`… so that we can use `setDrawRange()` to animate the lines"; and on
performance, "We constantly monitor the achieved FPS, and if we fail to maintain 55.5 FPS over the
last 50 frames we start to degrade the quality of the scene", across "four quality tiers".

**Checked live on 2026-08-26: github.com's current homepage no longer shows that globe** (it has five
WebGL canvases, none of them a globe). The blog post remains the record.

### Assets, free and public domain

Relevant because it removes the tile-bill problem entirely:

- **Natural Earth** raster + vector: "All versions of Natural Earth raster + vector map data found on
  this website are in the public domain", usable "without needing permission or crediting authors"
  ([terms of use](https://www.naturalearthdata.com/about/terms-of-use/)). This is the material for a
  matte, stylised, non-photographic earth — coastlines and country polygons you can extrude, dot, or
  fill flat.
- NASA Blue Marble imagery is the standard photographic source; three-globe ships a 4096 × 2048
  derivative in its examples. The exact maximum published resolution and NASA's licence wording I
  could not pin to a stable primary page — the old `visibleearth.nasa.gov` collection URL now 301s to
  `science.nasa.gov` and the destination page states neither **[UNESTABLISHED]**.

## 5. react-three-fiber + drei (+ postprocessing, + three-geospatial)

`@react-three/fiber` 9.7.0 (31,798 ★, pushed 2026-08-25) and `@react-three/drei` 10.7.8 (9,821 ★,
pushed 2026-08-25). Both MIT, both peer on `three >= 0.156/0.159` and **React 19** — worth noting
against this project's React version. Measured together with React at 307 KB gzipped, of which React
itself is 60 KB; so **r3f + drei add ~247 KB gzipped over plain React**, versus ~138 KB for plain
three.js.

What drei supplies that is directly on the critical path (from its
[README component index](https://github.com/pmndrs/drei#readme)): `CameraControls` (the r3f binding
for `camera-controls` 3.1.2), `Html`, `Image`, `Billboard`, `Instances`, `useTexture`, `useKTX2`,
`shaderMaterial`, `Stars`, `Sparkles`, `Cloud`, `Environment`, `Bvh`, `AdaptiveDpr`,
`PerformanceMonitor`, `DetectGPU`, `Bounds`, `Float`, `CameraShake`.

**The ceiling-raiser worth flagging:**
[`takram-design-engineering/three-geospatial`](https://github.com/takram-design-engineering/three-geospatial)
(1622 ★, pushed 2026-05-27) publishes `@takram/three-atmosphere` 0.19.1 and `@takram/three-clouds`
0.7.6 — an implementation of **Eric Bruneton's Precomputed Atmospheric Scattering** with r3f
components (`<Atmosphere>`, `<Sky>`, `<Stars>` from the Yale Bright Star Catalog, `<SunLight>`,
`<SkyLight>`, `<AerialPerspective>`) and volumetric clouds. Requirements: `three`, `postprocessing`,
the r3f packages, floating-point render buffers, and precomputed lookup textures. Stated limitations:
ECEF-fixed reference frame, no volumetric light shafts, horizon artefacts from float precision, GLSL
only (WebGPU planned), Earth only. **Its cost and frame rate on an iPad is [UNESTABLISHED]** — float
render targets plus volumetric clouds is exactly the workload an iPad GPU dislikes, and this must be
measured, not assumed.

`r3f-globe` (§2) is the bridge if you want three-globe's layers inside your own r3f scene; it costs
the same 667 KB gzipped because the weight is `three-globe`, not the wrapper.

## 6. MapLibre GL JS — globe projection

6.6.0, **BSD-3-Clause**, 11,454 ★, pushed 2026-08-26. **250 KB gzipped** measured for `Map` + `Marker`.
No account, no token, no telemetry — the licensing story is the cleanest of any map engine here.

Globe is a projection, not an object: `map.setProjection({ type: 'globe' })`, also settable from the
style spec with `interpolate` expressions across zoom, alongside `mercator` and `vertical-perspective`
([style spec: projection](https://maplibre.org/maplibre-style-spec/projection/)). Internally,
"Geometry is projected to the sphere in the vertex shader"
([developer guide](https://github.com/maplibre/maplibre-gl-js/blob/main/developer-guides/globe.md)).

What it gives you that the three.js family does not:

- **Camera easing is fully overridable.** `AnimationOptions.easing` is `(t: number) => number`
  alongside `duration`, `offset`, `animate` and `essential`
  ([API docs](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/AnimationOptions/)). `flyTo`
  and `easeTo` are exactly the rotate-and-zoom primitive this app needs.
- **Built-in clustering.** GeoJSON sources take `cluster`, `clusterRadius`, `clusterMaxZoom`,
  `clusterMinPoints`, `clusterProperties`
  ([style spec: sources](https://maplibre.org/maplibre-style-spec/sources/)). **But this clusters
  *style layers*, not `Marker` DOM elements** — a `Marker` with a custom `element` is placed by you and
  is not part of the source, so a thumbnail-marker design gets no clustering for free.
- **A styleable atmosphere you can switch off.** `sky-color` (`#88C6FC`), `horizon-color`,
  `fog-color`, `sky-horizon-blend` (0.8), `horizon-fog-blend` (0.8), `fog-ground-blend` (0.5) and
  `atmosphere-blend` (0.8, "where 1 is visible atmosphere and 0 is hidden"), all interpolatable
  ([style spec: sky](https://maplibre.org/maplibre-style-spec/sky/)).
- **Custom WebGL layers work on the globe** — MapLibre ships an official
  [Add a simple custom layer on a globe](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-simple-custom-layer-on-a-globe/)
  example, and a [3D tiles via three.js](https://maplibre.org/maplibre-gl-js/docs/examples/add-3d-tiles-using-threejs/)
  example. This is the escape hatch Mapbox v3 does not have (§7).

Where it breaks for this app:

- **It switches to Mercator at about zoom 12** for floating-point precision reasons — the developer
  guide says the transition is "barely perceptible" because the projections converge, but it means the
  globe is a low-zoom presentation, not a continuous zoom-to-destination.
- **The surface is map tiles.** Making it look like anything other than a map means authoring a full
  style; you do not get a material to swap. There is no "matte stylised earth" knob.
- The globe cannot constrain map centre, and `setLocationAtPoint` "may sometimes not find a valid
  solution" (developer guide).
- Tiles have to come from somewhere. Self-hosting is possible (this is the point of MapLibre) but is a
  separate infrastructure decision, and OSM-derived tiles carry attribution obligations.

**Opinion:** MapLibre is the right answer for a *map* app and the wrong shape for a cinematic
memory-globe. Its strength here is as a fallback if the bespoke look proves too hard: it is free, it
is BSD, and its camera API is better than globe.gl's.

## 7. Mapbox GL JS v3 — globe projection

3.29.0. **Flag this loudly: it is not open source and it requires an account.**

From [the licence](https://github.com/mapbox/mapbox-gl-js/blob/main/LICENSE.txt): v2.0 onward is
proprietary (only ≤ 1.13 was BSD-3-Clause); use is restricted to "developers with a current active
Mapbox account" in good standing; "modifications that change or interfere with marked portions of the
code related to billing, accounting, or data collection are not authorized"; and "the SDK sends
limited de-identified location and usage data".

Pricing ([mapbox.com/pricing](https://www.mapbox.com/pricing)): map loads model, 50,000 free monthly
loads, then $5.00 per 1,000 up to 100k, tapering to $2.50 per 1,000 above 1M. A private family app
will never leave the free tier — **the disqualifier is the account, the telemetry and the ToS, not the
bill.**

Technically: `projection: 'globe'` since v2.9, with a customisable `fog` (lower/upper atmosphere,
thickness, background colour, star brightness) supporting zoom expressions. Two documented
limitations that matter: **it does not support `CustomLayerInterface`** and it does not support the
deprecated sky layer ([Mapbox globe guide](https://docs.mapbox.com/mapbox-gl-js/guides/globe/)). The
first one is the killer — with no custom WebGL layer, you cannot inject your own shader work into the
globe at all.

## 8. CesiumJS / Resium

Cesium 1.144.0 (Apache-2.0, 15,605 ★, pushed 2026-08-26); Resium 1.25.0 (MIT, React bindings, peers on
`cesium 1.x`).

**Size is the immediate problem.** The prebuilt `Build/Cesium/Cesium.js` is **5.97 MB raw,
1.73 MB gzipped** (measured via unpkg), on top of separate Workers and Assets directories; the npm
tarball unpacks to 148 MB. Even with lazy loading, this is not an opening screen for an iPad-first PWA.

**Cost/licensing:** the engine is Apache-2.0 and can run without Cesium ion, but ion is where the
global imagery and terrain live. ion tiers: Community (free, 5 GB storage, 15 GB/month streaming),
Commercial ($149/mo individual, $524/mo team), Premium ($499/$874)
([pricing](https://cesium.com/platform/cesium-ion/pricing/)). The
[quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/) is built around setting
`Ion.defaultAccessToken`. **A free tier exists and would likely suffice, but it is an account and a
streaming quota on the app's first screen.**

Ceiling: very high for *geospatial realism* — this is the engine behind photorealistic 3D tiles — and
low for *art direction*. Cesium's `Globe`, `Scene` and `ImageryLayer` model is not a three.js scene
graph you can drop a custom material into.

## 9. deck.gl `_GlobeView`

9.3.10, MIT, 14,526 ★, pushed 2026-08-26. Ruled out on the documentation's own terms
([GlobeView docs](https://deck.gl/docs/api-reference/core/globe-view)):

- "This class is experimental, which means it does not provide the compatibility and stability that
  one would typically expect from other View classes."
- **"No rotation" — the camera always points at the earth's centre with north up.** A cinematic
  rotate-and-zoom with any tilt is off the table.
- No high-precision rendering above zoom 12; `TileLayer`/`MVTLayer` support experimental;
  `HeatmapLayer`, `ContourLayer`, `TerrainLayer` and `MaskExtension` unsupported; problems mixing with
  `MapView`.

The globe surface itself is not provided — deck.gl's own globe examples draw it as a `SimpleMeshLayer`
sphere with an imagery texture, i.e. you are back to authoring it. Combined with the aggregation-layer
gap, **deck.gl gives you no clustering here either.**

## 10. Google Photorealistic 3D Tiles (via 3d-tiles-renderer or Cesium)

[NASA-AMMOS/3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) 0.5.2, Apache-2.0,
2,437 ★, pushed 2026-08-24, peers on `three >= 0.167` with optional r3f and Babylon.js bindings. It is
healthy, well-maintained, and has both a
[Google Photorealistic](https://nasa-ammos.github.io/3DTilesRendererJS/three/googleMapsAerial.html)
and a [Google Globe](https://nasa-ammos.github.io/3DTilesRendererJS/three/googleMapsExample.html)
example. Its README is explicit: those examples require "a
[Google Tiles API Key](https://developers.google.com/maps/documentation/tile/3d-tiles) or
[Cesium Ion API Key](https://cesium.com/platform/cesium-ion/)".

**Flag loudly.** Google's Map Tiles API terms
([policies](https://developers.google.com/maps/documentation/tile/policies)):

- You "must not pre-fetch, index, store, or cache any Content except under the limited conditions
  stated in the terms" — **offline applications are explicitly a prohibited use.** For a PWA whose
  whole premise includes an offline shell, that is a direct conflict.
- Mandatory attribution: aggregate and display all per-tile copyright strings from
  `asset.copyright`, "usually along the bottom of the rendering", with visual separation from any
  third-party renderer branding.
- Billing: "Map Tiles API: Photorealistic 3D Tiles" is an **Enterprise-category SKU** requiring billing
  enabled ([usage and billing](https://developers.google.com/maps/documentation/tile/usage-and-billing));
  root tileset queries count against the daily quota while session-token and individual tile requests
  do not. The published pricing page lists it as included in the **Pro ($1,200/month)** and Enterprise
  plans ([mapsplatform.google.com/pricing](https://mapsplatform.google.com/pricing/)). **The exact
  per-1,000 rate for this SKU is [UNESTABLISHED]** — Google's public pages point at a pricing list I
  could not resolve to a number.

For a private family app: an API key, an attribution bar, a caching prohibition and an Enterprise SKU.
**Out.**

## 11. Also checked, and ruled out

- **[dataarts/webgl-globe](https://github.com/dataarts/webgl-globe)** (Google Data Arts, 3,770 ★) —
  **archived**, last push 2020-09-04. Dead.
- **[chrisrzhou/react-globe](https://github.com/chrisrzhou/react-globe)** (314 ★) — last push
  2021-04-02, five years stale. Unmaintained in practice even though not formally archived.
- **`three-globe` used directly** — viable, and it is what `r3f-globe` does. You keep the layers and
  supply your own renderer, camera, controls and raycasting. You still pay the `three/webgpu` +
  `h3-js` tax (§2.5). **Opinion:** if you are already writing the renderer and camera, the remaining
  value of `three-globe` for twenty pins is `polar2Cartesian` and a data-binding helper, and that is
  not worth 400 KB.
- **`giro3d`, `iTowns`, `threepipe`, `three-geospatial`** — surfaced from the 3DTilesRendererJS
  community list. Of these only `three-geospatial` is relevant here, and it is covered in §5; the
  others are geospatial frameworks in the Cesium mould.

## 12. iPadOS Safari specifically

### WebGL2 and WebGPU

WebGL2 has been available since Safari 15, on iPadOS 15 as well as macOS: "WebKit now supports WebGL2.
In addition, the WebGL implementation now runs on top of Metal for better performance"
([New WebKit Features in Safari 15](https://webkit.org/blog/11989/new-webkit-features-in-safari-15/)).
WebGPU shipped in **Safari 26.0**, and the announcement names Three.js among the frameworks that work
with it ([WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
So `WebGPURenderer` is a real future option on a current iPad — though note that today it is only
being pulled into the bundle by accident (§2.5).

**Risk worth knowing:** in WebKit trunk, `WebGLEnabled` carries `disableInLockdownMode: true`
([`UnifiedWebPreferences.yaml`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml)) —
so does `WebGPUEnabled`. **On an iPad with Lockdown Mode enabled, the globe does not render at all.**
Whatever the globe is built on, the app needs a non-WebGL fallback entrance, or at minimum a graceful
message.

### Touch gestures and page scroll

The library's controls decide this, and both realistic options do the right thing:

- **three.js `OrbitControls`** sets `this.domElement.style.touchAction = 'none'` in `connect()` and
  restores it in `disconnect()`
  ([OrbitControls.js](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/controls/OrbitControls.js)),
  with defaults `touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }`. globe.gl additionally sets
  `enablePan = false`, so two fingers become pure dolly.
- **`camera-controls`** documents one-finger orbit, two-finger pinch dolly, two/three-finger truck,
  all configurable ([readme](https://github.com/yomotsu/camera-controls/blob/dev/readme.md)).

`touch-action: none` on the canvas is what stops the gesture fighting page scroll. **[UNESTABLISHED]:**
whether that is sufficient against iPadOS's rubber-band / overscroll and the standalone-PWA
pull-to-refresh; that needs a device test, and is a known source of grief.

globe.gl's own pointer plumbing listens to `pointermove`/`pointerdown`/`pointerup` and contains an
explicit Safari workaround — "`ev.pressure` always 0 on Safari, so we used the `isPointerPressed`
tracker" — plus relaxed drag thresholds for touch/pen input
([three-render-objects.js](https://github.com/vasturiano/three-render-objects/blob/master/src/three-render-objects.js)).
Someone has already been here.

### Texture size limits

`MAX_TEXTURE_SIZE` is **not** a WebKit constant — it is read straight from the driver. WebKit queries
`GL_GetIntegerv(MAX_TEXTURE_SIZE, …)` through ANGLE at context creation
([`GraphicsContextGLANGLE.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/angle/GraphicsContextGLANGLE.cpp))
and caches it into `m_maxTextureSize`
([`WebGLRenderingContextBase.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/canvas/WebGLRenderingContextBase.cpp)).
**The actual value on the target iPad is [UNESTABLISHED] and must be measured** with
`gl.getParameter(gl.MAX_TEXTURE_SIZE)` — a two-line spike.

Whether 8K/16K earth textures are viable is settled by arithmetic, not by the limit. Uncompressed
RGBA8, with mipmaps costing a further ⅓:

| Equirectangular texture | RGBA8 | with mipmaps |
|---|---|---|
| 4096 × 2048 (globe.gl's shipped Blue Marble) | 33.6 MB | ≈ 44.8 MB |
| 8192 × 4096 | 134 MB | ≈ 179 MB |
| 16384 × 8192 | 537 MB | ≈ 716 MB |

**16K is not viable. 8K is a gamble. 4K is the safe default**, and the fact that globe.gl's canonical
asset is 4K is not a coincidence.

The mitigation, and it is a good one: **compressed textures**. WebKit implements
`WEBGL_compressed_texture_astc`
([`WebGLCompressedTextureASTC.*` in `Source/WebCore/html/canvas`](https://github.com/WebKit/WebKit/tree/main/Source/WebCore/html/canvas)),
and ASTC is the native format for Apple GPUs. An 8K ASTC earth is roughly an order of magnitude
smaller in GPU memory than RGBA8 and needs no decode on the main thread. three.js ships `KTX2Loader`
and drei exposes `useKTX2`. **Whether the extension is actually exposed on the target iPad is
[UNESTABLISHED]** — it depends on the driver advertising `GL_KHR_texture_compression_astc_ldr` — and
is another two-line spike alongside the `MAX_TEXTURE_SIZE` check.

### Memory and the tab-kill

What I can establish:

- **WebKit does track WebGL memory including your textures.** `updateMemoryCost()` sums the default
  framebuffer plus `context->estimatedMemoryCost()`, which on the ANGLE backend is
  `EGL_QueryContext(…, EGL_CONTEXT_MEMORY_USAGE_ANGLE, …)` — a live per-context figure, pushed from the
  GPU process to the web process over IPC whenever it changes
  (`WebGLRenderingContextBase.cpp`, `GraphicsContextGLANGLE.cpp`,
  [`RemoteGraphicsContextGL.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/GPUProcess/graphics/RemoteGraphicsContextGL.cpp)).
  The comment is honest about its precision: "Computes only a rough ballpark figure to drive garbage
  collection and Web Inspector."
- **A hard cap on live WebGL contexts exists**: `maxActiveContexts = 16` on the main thread,
  `maxActiveWorkerContexts = 4`; exceeding it calls `recycleContext()` on the least recently active
  one — i.e. an existing context is *lost*, not the new one refused
  (`WebGLRenderingContextBase.cpp`). Irrelevant for one globe; relevant if the story renderer also
  opens contexts.

What I cannot: **the threshold at which iPadOS kills a Safari tab is [UNESTABLISHED]**. It is an OS
jetsam behaviour, not a documented WebKit constant, and Apple publishes no number. The only way to
find the ceiling for this app is to load it on the actual iPad and watch.

### Frame rate

**[UNESTABLISHED], and unestablishable by reading.** No number in this note is a frame rate. The
prototype must measure it on the device. GitHub's approach — monitor achieved FPS and degrade across
quality tiers — is the pattern worth copying regardless of which candidate wins, and drei packages
it as `PerformanceMonitor` + `AdaptiveDpr`.

## 13. Coincident pins (`Zillertal 2024` / `Zillertal 2026`)

Recorded per candidate, as the ticket asks:

| Candidate | Coincident pins | Clustering / spiderfy available |
|---|---|---|
| globe.gl / three-globe / r3f-globe | Two markers at identical lat/lng are drawn at identical positions and overlap exactly. Raycast hit order is by distance, so one will always win the tap. | **None.** No `cluster*` accessor exists anywhere in the typings. Author it yourself. |
| cobe | Same — two markers, one disc. | None, and no hit-testing to build on. |
| Bespoke three.js | Same, but you own the placement function, so an offset or a stacked-card layout is a few lines. | You write it — which for 20 pins is the cheapest option on this table. |
| MapLibre GL JS | GeoJSON sources cluster natively (`cluster`, `clusterRadius`, `clusterMaxZoom`, `clusterMinPoints`, `clusterProperties`). | **Yes, but only for style layers.** A `Marker` with a custom DOM `element` is placed by the application and is not part of the source, so a thumbnail-marker design gets no clustering. Spiderfy is not in the API. |
| Mapbox GL JS | Same clustering model as MapLibre. | Same caveat. |
| deck.gl `_GlobeView` | — | Aggregation layers are unsupported in this view. |

**What building spiderfy would take**, concretely, in the three.js family: group `Destination`s by
rounded coordinate; for any group with more than one member, at render time lay the members out on a
small circle in the tangent plane at that coordinate, draw a short connector from the shared anchor to
each, and animate the fan-out on tap. For twenty pins this is one function and a tween — perhaps
60–100 lines. It is the same work in every candidate.

**Opinion, and worth putting to Marco before any of it is built:** with two Memories in one valley,
the cheaper answer is probably domain-level — one pin per `Destination` that opens a chooser when it
holds more than one Memory. That is a design decision the map already flags as open, and it should be
made before a spiderfy interaction is written.

## 14. Licensing and cost, summarised

| Candidate | Licence | Account / key | Recurring cost | Attribution |
|---|---|---|---|---|
| three.js, globe.gl, three-globe, react-globe.gl, r3f-globe, r3f, drei, cobe, camera-controls | **MIT** | none | none | none |
| `@takram/three-*` | MIT | none | none | none |
| Natural Earth data | **public domain** | none | none | none required |
| MapLibre GL JS | **BSD-3-Clause** | none for the library | tiles: whatever you self-host or buy | OSM-derived tiles carry attribution obligations |
| deck.gl | MIT | none | none | none |
| 3d-tiles-renderer | Apache-2.0 | none for the library | none | depends on the tile source |
| CesiumJS | Apache-2.0 | **ion token in practice** | ion Community free (5 GB / 15 GB per month), Commercial from $149/mo | per data source |
| Mapbox GL JS | **proprietary** | **required, plus telemetry** | 50k free loads/mo, then $5/1,000 | Mapbox attribution |
| Google Photorealistic 3D Tiles | Google ToS | **required, billing enabled** | **Enterprise SKU**, exact rate [UNESTABLISHED] | mandatory on-screen copyright line; **caching/offline prohibited** |

**The two loud flags: Mapbox and Google.** Mapbox is proprietary, mandates an account, transmits
usage data, and forbids modifying the billing code. Google's 3D Tiles requires billing, mandates an
attribution bar, and explicitly prohibits offline use — which collides with this app being a PWA.
Neither belongs in a private family app.

## 15. Ranked shortlist

**Real candidates, in order.**

1. **Bespoke three.js (optionally through react-three-fiber + drei).** Highest ceiling by a wide
   margin — every material, light, pass and easing curve is yours. Cheapest bundle: **138 KB gzipped**
   measured, or ~247 KB over React if you take r3f + drei for the ergonomics. Every mechanical piece
   already exists (`Raycaster`, `Spherical`, `OrbitControls`/`camera-controls`, `EffectComposer`,
   drei's perf guards); what is left to author is the earth's look and the camera choreography — which
   is exactly the part no library can give you anyway. Precedent: GitHub's globe.
   **What it cannot do:** nothing rendering-wise. What it *costs* is art-direction time and the risk
   that the first two attempts look worse than globe.gl's default. That risk is real and is the reason
   to prototype rather than decide.

2. **globe.gl / react-globe.gl.** The fastest route to something on screen with pins, hit-testing,
   labels and a working camera, and its ceiling is genuinely higher than its gallery: custom globe
   material, custom `Object3D` or DOM pins, exposed scene/camera/renderer/controls, a live
   `EffectComposer`. **What it cannot be made to do:** override `pointOfView` easing (Cubic.InOut,
   hardcoded); tune the atmosphere beyond colour and altitude; keep MSAA once you add a post pass;
   shed **400 KB gzipped** of heatmap/hex-bin machinery you will never call. Use it as the control in
   a prototype — "is bespoke actually better than this?" is a question you can only answer by having
   this on screen next to it.

3. **MapLibre GL JS globe.** The only candidate with free-and-open licensing *and* a first-class
   camera API (`flyTo` with your own easing function) *and* built-in clustering. But its surface is a
   tile style, not a material, so the visual ceiling is "a beautiful map", not "a cinematic object",
   and it drops to Mercator around zoom 12. Keep it as the fallback if the bespoke look stalls.

**Not real for this app:** cobe (no zoom, no picking — but keep it in mind if the design shrinks to a
static idling globe); deck.gl `_GlobeView` (experimental, camera cannot rotate); Cesium/Resium
(1.73 MB gzipped engine plus an ion token); Mapbox v3 (proprietary, account, telemetry, and no
`CustomLayerInterface` on globe); Google Photorealistic 3D Tiles (billing, attribution bar, offline
prohibited); `webgl-globe` and `chrisrzhou/react-globe` (unmaintained).

### The 2–3 prototype directions to put in front of Marco

Short and frequent, per the map's Notes — each of these is one session, ends in a screenshot on the
iPad, and asks Marco a single question.

**A. Bespoke, matte and stylised.** A `SphereGeometry` with a flat or gradient base colour, country
outlines or a dot matrix from Natural Earth (public domain) instead of photography, a hand-written
Fresnel rim, `camera-controls` for touch and an awaitable `setLookAt` for the rotate-and-zoom, twenty
pins as billboarded rounded planes carrying the cover thumbnail as a texture, one `Raycaster`.
Measured cost: ~138 KB gzipped. **Question for Marco: does this feel like the app, or does it feel
like a diagram?**

**B. Bespoke, photographic and cinematic.** Same skeleton as A, but a 4K (and, if the device check
allows, 8K ASTC) earth texture, `MeshStandardMaterial` with a specular/water map, `UnrealBloomPass`
plus `OutputPass` on the composer, and stars. Optionally swap the hand-rolled rim for
`@takram/three-atmosphere` and measure what that costs on the iPad. **Question for Marco: is
photographic the right register, or too literal for a memory app?**

**C. globe.gl as the control.** Twenty `htmlElementsData` markers carrying real cover thumbnails,
`showAtmosphere(false)`, a custom `globeMaterial()`, one bloom pass on `postProcessingComposer()`, and
`pointOfView(..., 1200)` for the transition. Perhaps an afternoon. **Question for Marco: is the
hardcoded Cubic.InOut camera move good enough, and does this get close enough to A/B to be worth
saving the bespoke work?**

Run C first or alongside A — it is the cheapest, and if it clears the bar the other two never need to
be built. **Whichever runs first must also carry the two-line device check** (`MAX_TEXTURE_SIZE`,
ASTC extension presence) and an FPS counter, because those three facts unblock every other decision
in this note.

## What I could not establish

In rough order of how much it matters.

1. **Real-device frame rate on the target iPad**, for any candidate. Unestablishable by reading; the
   prototype must measure it.
2. **`gl.getParameter(gl.MAX_TEXTURE_SIZE)` and ASTC extension availability** on the target iPad. Both
   come from the driver, not from WebKit. Two lines of JavaScript.
3. **The memory threshold at which iPadOS kills a Safari tab.** An OS jetsam behaviour with no
   published number. WebKit's own WebGL accounting is explicitly "a rough ballpark figure".
4. **Whether `touch-action: none` on the canvas is sufficient** against iPadOS overscroll,
   rubber-banding, and standalone-PWA pull-to-refresh. Device test.
5. **Any shipped consumer product on globe.gl / three-globe that clears a high visual bar.** I found
   none. The only public evidence is the maintainer's example gallery. Whether Aceternity UI's
   "GitHub Globe" component really uses react-globe.gl I could not read from the public page.
6. **The exact per-1,000 price of Google's Photorealistic 3D Tiles SKU.** Google's public pages point
   at a pricing list I could not resolve; it is listed as an Enterprise-plan inclusion.
7. **Maximum published NASA Blue Marble resolution and NASA's stated image-use policy.** The old
   `visibleearth.nasa.gov` collection URL 301s and the destination page states neither.
8. **The cost of `@takram/three-atmosphere` / `three-clouds` on iPad hardware.** Float render targets
   plus volumetric clouds is the exact workload to be suspicious of; measure before designing around it.
9. **Whether driving globe.gl's camera manually (via `.camera()`/`.controls()`) while the library also
   reacts to `controls` change events is judder-free.** Reasoned from source; not run.

## Sources

Primary, in the order first used.

**Package and repository metadata**

- [npm registry API](https://registry.npmjs.org/) — versions, publish dates, licences, dependency vs.
  peer dependency, for every package named in the preamble
- [GitHub REST API](https://docs.github.com/rest) — `pushed_at`, `archived`, `stargazers_count`
- [unpkg](https://unpkg.com/) — published `dist` files, measured directly

**globe.gl family**

- [globe.gl `src/index.d.ts`](https://github.com/vasturiano/globe.gl/blob/master/src/index.d.ts) and [`src/globe.js`](https://github.com/vasturiano/globe.gl/blob/master/src/globe.js)
- [globe.gl `package.json`](https://github.com/vasturiano/globe.gl/blob/master/package.json)
- [three-globe `src/index.d.ts`](https://github.com/vasturiano/three-globe/blob/master/src/index.d.ts), [`src/layers/globe.js`](https://github.com/vasturiano/three-globe/blob/master/src/layers/globe.js), [`src/layers/objects.js`](https://github.com/vasturiano/three-globe/blob/master/src/layers/objects.js), [`src/layers/htmlElements.js`](https://github.com/vasturiano/three-globe/blob/master/src/layers/htmlElements.js), [`src/utils/GlowMesh.js`](https://github.com/vasturiano/three-globe/blob/master/src/utils/GlowMesh.js)
- [three-render-objects `src/index.d.ts`](https://github.com/vasturiano/three-render-objects/blob/master/src/index.d.ts) and [`src/three-render-objects.js`](https://github.com/vasturiano/three-render-objects/blob/master/src/three-render-objects.js)
- globe.gl examples: [custom globe styling](https://github.com/vasturiano/globe.gl/blob/master/example/custom-globe-styling/index.html), [custom layer](https://github.com/vasturiano/globe.gl/blob/master/example/custom-layer/index.html), [HTML markers](https://github.com/vasturiano/globe.gl/blob/master/example/html-markers/index.html)
- [react-globe.gl README](https://github.com/vasturiano/react-globe.gl#readme), [r3f-globe README](https://github.com/vasturiano/r3f-globe#readme)

**three.js and its ecosystem**

- [three.js `OrbitControls.js`](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/controls/OrbitControls.js)
- three.js `examples/jsm/postprocessing/EffectComposer.js` and `RenderPass.js` (read from the installed r185.1 package)
- [drei README](https://github.com/pmndrs/drei#readme)
- [camera-controls readme](https://github.com/yomotsu/camera-controls/blob/dev/readme.md)
- [takram three-geospatial: atmosphere package](https://github.com/takram-design-engineering/three-geospatial/tree/main/packages/atmosphere)

**cobe**

- [cobe `src/index.d.ts`](https://github.com/shuding/cobe/blob/main/src/index.d.ts), [`globe.frag.glslx`](https://github.com/shuding/cobe/blob/main/src/globe.frag.glslx), [`marker.glslx`](https://github.com/shuding/cobe/blob/main/src/marker.glslx), [README](https://github.com/shuding/cobe#readme)
- [COBE: WebGL Globe in 5kB](https://shud.in/thoughts/cobe) — author's own account
- [Magic UI Globe component](https://magicui.design/docs/components/globe) — verified live

**Map engines**

- [MapLibre globe developer guide](https://github.com/maplibre/maplibre-gl-js/blob/main/developer-guides/globe.md)
- [MapLibre style spec: projection](https://maplibre.org/maplibre-style-spec/projection/), [sources](https://maplibre.org/maplibre-style-spec/sources/), [sky](https://maplibre.org/maplibre-style-spec/sky/)
- [MapLibre `AnimationOptions`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/AnimationOptions/), [`Marker`](https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/), [custom layer on a globe example](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-simple-custom-layer-on-a-globe/)
- [Mapbox globe guide](https://docs.mapbox.com/mapbox-gl-js/guides/globe/), [LICENSE.txt](https://github.com/mapbox/mapbox-gl-js/blob/main/LICENSE.txt), [pricing](https://www.mapbox.com/pricing)
- [deck.gl `GlobeView` docs](https://deck.gl/docs/api-reference/core/globe-view)
- [Cesium ion pricing](https://cesium.com/platform/cesium-ion/pricing/), [CesiumJS quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/)
- [3DTilesRendererJS README](https://github.com/NASA-AMMOS/3DTilesRendererJS#readme)
- [Google Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies), [usage and billing](https://developers.google.com/maps/documentation/tile/usage-and-billing), [Google Maps Platform pricing](https://mapsplatform.google.com/pricing/)

**WebKit / iPadOS**

- [`UnifiedWebPreferences.yaml`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml) — `WebGLEnabled`, `WebGPUEnabled`, `disableInLockdownMode`
- [`WebGLRenderingContextBase.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/canvas/WebGLRenderingContextBase.cpp) — `maxActiveContexts`, `updateMemoryCost`, `m_maxTextureSize`
- [`GraphicsContextGLANGLE.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/angle/GraphicsContextGLANGLE.cpp) — `estimatedMemoryCost`, `EGL_CONTEXT_MEMORY_USAGE_ANGLE`
- [`RemoteGraphicsContextGL.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/GPUProcess/graphics/RemoteGraphicsContextGL.cpp) and [`RemoteGraphicsContextGLProxy.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/WebProcess/GPU/graphics/RemoteGraphicsContextGLProxy.cpp)
- [`Source/WebCore/html/canvas`](https://github.com/WebKit/WebKit/tree/main/Source/WebCore/html/canvas) — `WebGLCompressedTextureASTC.*`
- [New WebKit Features in Safari 15](https://webkit.org/blog/11989/new-webkit-features-in-safari-15/) — WebGL2 on Metal, iPadOS 15
- [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) — WebGPU, Anchor Positioning
- [WebKit Features for Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/), [26.5](https://webkit.org/blog/17938/webkit-features-for-safari-26-5/) — Anchor Positioning refinements

**Other**

- [How we built the GitHub globe](https://github.blog/engineering/engineering-principles/how-we-built-the-github-globe/) — GitHub engineering, first-party
- [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/)

Secondary, used only as leads and not relied upon for any claim: web search results attributing
GitHub's homepage globe to react-globe.gl (contradicted by GitHub's own post, see §2.7).
