# Scroll is the Story's timeline

A `Memory` is presented as one continuous choreographed sequence — Ken Burns moves, cross-dissolves, timed `Chapter` titles — but the viewer's scroll position drives the clock rather than a timer. Tapping a `Media Item` takes it full-screen, with sound if it is video. We chose this over unattended autoplay because reliving a memory is stronger when the viewer can steer it, and because it costs nothing: CSS scroll-driven animations shipped unconditionally enabled in Safari 26.0 and run on the compositor thread in 26.4, so the choreography is declarative CSS with no JavaScript in the animation loop.

Note that `docs/inception-prompt.md` says a Memory plays automatically. That premise is **amended, not overruled**: it still plays, but the viewer drives it. Unattended playback returns after v1 as an explicit mode.

## Considered options

- **Autoplaying time-driven story.** The origin document's assumption. Rejected as the *default*: it makes the viewer a spectator, and every interaction has to be bolted onto a running clock.
- **Scroll as layout** — a magazine-like composition of large and small tiles animating into view. Better for orientation, but it makes composition the heart instead of timing, shows several items at once, and cannot meaningfully take a play button.
- **Pre-rendered MP4**, produced by the `Indexer` and simply played back. Rejected as the renderer, and worth recording because it will be proposed again: it strips out every interaction, seeking needs forced keyframes per `Chapter` and produces `206` responses a Service Worker cannot cache, and ffmpeg's `vf_zoompan` crops on the chroma grid so the Ken Burns move snaps in two-pixel steps. It survives as the offline/Lockdown-Mode fallback and as the basis for a future "share this Memory" feature.

## Consequences

- **The catalogue contract must be versioned and additive**, and must carry the story fields — a start and end rect per `Media Item`, plus a shot duration — from day one. v1 fills them formulaically (alternating direction, slight zoom, portrait and landscape handled differently); saliency and face detection in the `Indexer` are a later recomputation of two fields, never a re-index of the library. A renderer seam only stays cheap while both renderers read the same data.
- **The renderer stays off canvas and WebGL.** Origin-taint would force CORS headers onto the NAS, which `<img>`/`<video>` rendering does not require.
- **Unattended playback, when it arrives, may only be the idle variant** — advance the scroll position, cancel on `touchstart`, resume once scrolling settles. Animating a `transform` instead of really scrolling reimplements touch scrolling and loses momentum and rubber-banding, which reads as wrong on Apple hardware immediately.
- Video remains an ordinary member of the sequence, muted and autoplaying while in view, per `CONTEXT.md`. Tapping is for size and sound, not for starting.

Full reasoning: [issue #12](https://github.com/marcovandehaar/rememberwhen/issues/12).

---

## Amendment, 2026-08-29: the CSS path is an optimisation, not the foundation

This ADR leant on the choreography being declarative CSS with no JavaScript in
the animation loop, and cited Safari 26.0 for it. That is still the best path,
but it turned out not to be load-bearing, and the record should not imply
otherwise.

The prototype for [issue #6](https://github.com/marcovandehaar/rememberwhen/issues/6)
ran on the household's actual iPad — a 2019 model, whose iPadOS tops out below
Safari 26. It reports `scroll-timeline: NO` and `animation-range: NO`, and the
CSS-only renderer shows a black screen there: every shot stays at its starting
opacity.

A fallback that interpolates the same curves by hand in a `requestAnimationFrame`
loop runs at **55-60 fps on that same device**. So the renderer works on current
hardware; newer hardware makes it cheaper, not possible.

**What this changes:** v1 must ship both paths and pick at runtime, and the
choice of scroll as the timeline no longer depends on a Safari version. What it
does not change is the decision itself — the verdict on the device was that
scrolling feels like reliving. The strongest reason turned out to be one nobody
designed: **iPadOS momentum scrolling becomes the story's easing curve**. Flick
it and it coasts to rest with the Ken Burns move still running. A time-driven
autoplay renderer cannot do that, because there the clock belongs to the app
rather than to the finger.
