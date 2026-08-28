# globe.gl for the globe, not bespoke three.js

The opening screen is built on **globe.gl**, rendering a photographic night earth with cover-photo pins, opened static and framed on Europe, with **no bloom pass**. We chose this over hand-writing the globe on three.js, which is what the research recommended — so the deviation is the thing worth recording.

A prototype built the same look four ways and put them on the actual iPad ([issue #7](https://github.com/marcovandehaar/rememberwhen/issues/7), branch `prototype/globe-c`). The deciding evidence was not aesthetic and not the bundle size: the bespoke variant was indistinguishable from the library one on desktop and ran faster, but **rendered its pins wrong on the iPad**. Building it ourselves means owning every device-specific bug ourselves, and globe.gl has that class of problem solved already, on hardware we do not have.

## Considered options

- **Bespoke three.js**, which [the research](https://github.com/marcovandehaar/rememberwhen/issues/3) ranked first: the highest ceiling, our own easing curve, and a measured 183 KB of globe machinery against globe.gl's 495 KB (both figures gzipped, React excluded — React is 58 KB on top of either). Built as variant D, deliberately to the same look so the comparison was about technique. Rejected on the iPad bug, not on looks.
- **A stylised, non-photographic globe** — a two-tone matte earth from the land/sea mask (variant B), and a dot-matrix earth in the register of GitHub's globe (variant C). Both rejected on taste, and variant C's rejection is the more useful one: it is technically the most convincing demonstration of what globe.gl can be pushed to, and it reads as analytical where a memory should read as warm. *"Mooi, als ik een strategy game maakte."*
- **cobe, MapLibre, Cesium, deck.gl, Google 3D Tiles**: all ruled out before prototyping, for structural reasons recorded in `docs/research/3d-globe-libraries.md`.

## Consequences

- **No bloom pass.** On a 2019 iPad it cost two thirds of the framerate (~20 fps against 50-60), and it was also what washed the background from near-black to light purple: `three-render-objects` builds globe.gl's composer as a bare `EffectComposer` with a single `RenderPass` and **no colour management at all**, so any second pass lifts every black. With one pass it renders straight to the antialiased default framebuffer and the colours are right. The glow on the pins is a CSS `box-shadow` and survives. Anything that adds a second pass later inherits both problems.
- **The camera easing is globe.gl's**: `pointOfView` hardcodes `Easing.Cubic.InOut` and exposes only the duration. Accepted deliberately — the movement was judged good on the device.
- **We carry ~400 KB of machinery we never call** (the `three/webgpu` heatmap path and `h3-js` for hex-bins), reached by unconditional top-level imports that no bundler can drop. A one-time download on a home network, cached by the PWA.
- **A single-maintainer dependency.** globe.gl is widely used and stable, but if it stops, we own a half-megabyte black box. The escape route is real and now proven: variant D exists on the prototype branch.
- **The globe opens framed on Europe**, where most Memories are. Trips to the US, Canada and Vietnam sit past the limb until the viewer drags. Unresolved, tracked as fog on the map.

Full reasoning and the device measurements: [issue #7](https://github.com/marcovandehaar/rememberwhen/issues/7).
