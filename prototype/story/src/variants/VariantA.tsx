import { useEffect, useMemo, useRef } from 'react'
import { beats, kenBurns, MEMORY_SUBTITLE, MEMORY_TITLE, type Beat } from '../story'
import { useScrollWindow } from '../useScrollWindow'

export const NAME = 'Vaste cadans'

// Every Media Item gets the same amount of scroll, with a quarter of it
// overlapping its neighbour so shots cross-dissolve rather than cut. The most
// filmic of the three, and the closest to "one shot per beat".
//
// Scroll IS the timeline: each shot's animation-range is its slice of the
// document scroll, so the finger drives the clock and there is no JavaScript
// in the animation loop at all.

const SLOT = 1.0 // how much scroll a shot's animation spans, in viewports
const STEP = 0.75 // how far apart consecutive shots start — the overlap

export function VariantA({ onOpen }: { onOpen: (b: Beat) => void }) {
  const list = useMemo(() => beats(), [])
  const { index, isMounted } = useScrollWindow(list.length)
  const videoRefs = useRef(new Map<string, HTMLVideoElement>())

  const totalUnits = (list.length - 1) * STEP + SLOT
  // Percentages are of the scrollable distance, which is the content minus one
  // viewport — so the last shot lands exactly at the bottom.
  const scrollable = totalUnits - 1

  const css = useMemo(() => {
    const rules = list.map((b) => {
      const kb = kenBurns(b)
      // The opening shot must already be on screen at scroll 0, and the last
      // one must not fade to black at the bottom — otherwise the story starts
      // and ends on an empty frame.
      const first = b.i === 0
      const last = b.i === list.length - 1
      const start = (b.i * STEP) / scrollable
      const end = (b.i * STEP + SLOT) / scrollable
      return `
        #shot-${b.i} {
          animation: shot-${b.i} linear both;
          animation-timeline: scroll(root block);
          animation-range: ${(start * 100).toFixed(4)}% ${(end * 100).toFixed(4)}%;
        }
        @keyframes shot-${b.i} {
          0%   { opacity: ${first ? 1 : 0}; transform: ${kb.from}; }
          14%  { opacity: 1; }
          86%  { opacity: 1; }
          100% { opacity: ${last ? 1 : 0}; transform: ${kb.to}; }
        }`
    })
    return rules.join('\n')
  }, [list, scrollable])

  // Only the shot under the finger plays. Muted video is unrestricted on
  // iPadOS; audio-producing video is capped at one at a time, which is why
  // nothing here carries sound until it is opened full-screen.
  useEffect(() => {
    for (const [id, el] of videoRefs.current) {
      const b = list.find((x) => x.item.id === id)
      if (b && Math.abs(b.i - index) <= 1) el.play().catch(() => {})
      else el.pause()
    }
  }, [index, list])

  return (
    <>
      <style>{css}</style>

      {/* The scroll length. Nothing is painted here; it only makes the page tall. */}
      <div style={{ height: `${totalUnits * 100}svh` }} />

      <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
        {list.map((b) =>
          !isMounted(b.i) ? null : (
            <div
              key={b.item.id}
              id={`shot-${b.i}`}
              onClick={() => onOpen(b)}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0,
                willChange: 'opacity, transform',
                cursor: 'pointer',
              }}
            >
              {b.item.kind === 'video' ? (
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(b.item.id, el)
                    else videoRefs.current.delete(b.item.id)
                  }}
                  src={b.item.src}
                  muted
                  playsInline
                  loop
                  preload="auto"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <img
                  src={b.item.src}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              )}

              {/* The Chapter beat: a title card that rides in on its own shot. */}
              {b.chapterStart && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'linear-gradient(180deg, rgba(0,0,0,.45), rgba(0,0,0,.15) 45%, rgba(0,0,0,.5))',
                    textAlign: 'center',
                    color: '#fff',
                  }}
                >
                  <div>
                    {b.i === 0 && (
                      <div style={{ font: '500 13px/1 -apple-system, system-ui, sans-serif', letterSpacing: '.22em', textTransform: 'uppercase', opacity: 0.8 }}>
                        {MEMORY_TITLE}
                      </div>
                    )}
                    <div style={{ font: '600 40px/1.15 -apple-system, system-ui, sans-serif', marginTop: 14, textShadow: '0 2px 30px rgba(0,0,0,.6)' }}>
                      {b.chapterStart.title}
                    </div>
                    <div style={{ font: '400 14px/1 -apple-system, system-ui, sans-serif', marginTop: 12, opacity: 0.75 }}>
                      {b.i === 0 ? MEMORY_SUBTITLE : `${b.chapterStart.from} – ${b.chapterStart.to}`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ),
        )}

        {/* Time of day, quietly. Real capture times. */}
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
            left: 0,
            right: 0,
            textAlign: 'center',
            color: 'rgba(255,255,255,.75)',
            font: '500 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
            textShadow: '0 1px 8px rgba(0,0,0,.9)',
            pointerEvents: 'none',
          }}
        >
          {list[index]?.item.taken}
        </div>
      </div>
    </>
  )
}
