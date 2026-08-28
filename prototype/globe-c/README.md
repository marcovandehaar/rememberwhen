# Prototype C — globe.gl opgerekt tot zijn plafond

Throwaway. Answers [issue #7](https://github.com/marcovandehaar/rememberwhen/issues/7):
**does globe.gl, pushed past its defaults, already clear the bar for the opening screen?**

Three variants of the same globe on one page, switchable with `?variant=A|B|C`,
the arrows in the floating bar, or the ← → keys.

| | Variant | What it argues |
|---|---|---|
| **A** | Fotografisch nacht | The earth is a photograph; pins are the cover photos themselves, glowing. Coincident pins fan apart. |
| **B** | Mat papier | No photography at all — a two-tone globe from the land/sea mask, flat light, light background. Names always readable, cover in a panel. Coincident pins deliberately left colliding, so the problem is visible. |
| **C** | Donker puntenraster | No earth texture; land is a dot matrix. Pins are real `Object3D`s, hot enough for bloom. One marker per coordinate with a chooser when it holds more than one Memory. |
| **D** | Zelfgebouwd (= A) | The same look as A, hand-written on three.js without globe.gl. Our own easing curve, our own colour management, 241 KB gzipped against 553. Exists to settle "library or bespoke" by looking rather than by arguing. |

All three use `showAtmosphere(false)`, a custom `globeMaterial()` where relevant,
`pointOfView(..., 1200)` for the rotate-and-zoom, and (A and C) one bloom pass on
`postProcessingComposer()`.

## Run

```
npm install
npm run dev
```

Vite binds to `0.0.0.0`. Open the **Network** URL it prints on the iPad, on the same wifi.
Plain `http://` is fine here: page and assets share an origin, so there is no
mixed-content problem — that only bites once the app is served over HTTPS.

## The HUD

Top-left, tap to collapse. It carries the facts the research marked
**[UNESTABLISHED]** because they come from the driver, not from documentation:
`MAX_TEXTURE_SIZE`, ASTC/ETC2/PVRTC availability, WebGL2, DPR, the renderer
string, and a live FPS with a running minimum.

If it says `NO WEBGL (Lockdown Mode?)`, that is the Lockdown Mode finding from
the research showing up for real.

## What to look at

1. **Does any of this clear the bar, or does it read as a demo globe?** That
   judgement is Marco's alone.
2. **Is the hardcoded `Cubic.InOut` camera move good enough?** globe.gl exposes
   the duration but not the curve. This is the ceiling you cannot raise.
3. **The silhouette.** Adding bloom costs MSAA; `addBloom` re-creates the
   composer targets with `samples: 4` to claw it back. Comment that loop out in
   `globeShared.ts` to see what globe.gl gives you by default.
4. **Touch**: rotate, pinch, and an interrupted gesture. Whether the page fights
   iPadOS overscroll.

## Known fake

`src/destinations.ts` is **placeholder data** — invented trips and generated
gradient covers, not photographs. The globe's look leans heavily on what the
pins carry, so treat any verdict as provisional until real cover photos are in.
Swapping is a one-liner: point `cover` at a real file.
