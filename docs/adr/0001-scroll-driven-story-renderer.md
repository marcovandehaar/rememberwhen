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
