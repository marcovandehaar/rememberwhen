import { useEffect, useMemo, useRef, useState } from 'react'
import {
  beats,
  kenBurns,
  opacityAt,
  transformAt,
  MEMORY_SUBTITLE,
  MEMORY_TITLE,
  type Beat,
} from '../story'
import { useScrollWindow } from '../useScrollWindow'

export const NAME = 'Vaste cadans'

// Every Media Item gets the same amount of scroll, with a quarter of it
// overlapping its neighbour so shots cross-dissolve rather than cut.
//
// Scroll IS the timeline. There are two paths to that, and which one runs is
// the most important thing this prototype measures:
//
//   CSS   — animation-timeline: scroll(root block), zero JavaScript in the
//           animation loop. Shipped in Safari 26.0.
//   JS    — the same curves interpolated by hand in a rAF loop, for anything
//           older. Marco's 2019 iPad reports scroll-timeline: NO, so this is
//           not a theoretical fallback: it is the path his hardware takes.
//
// Both read from the same kenBurns()/opacityAt() functions, so they should be
// indistinguishable apart from smoothness. If they are not, that is a finding.

const SLOT = 1.0 // how much scroll a shot's animation spans, in viewports
const STEP = 0.75 // how far apart consecutive shots start — the overlap

const PLATFORM_CAN =
  typeof CSS !== 'undefined' &&
  CSS.supports('animation-timeline: scroll(root block)') &&
  CSS.supports('animation-range: 10% 20%')

// ?mode=js forces the fallback even where the platform could do it, so the two
// paths can be compared side by side on one machine. ?mode=css asks for the
// platform path and simply does not get it where it is missing.
const FORCED = new URLSearchParams(location.search).get('mode')
export const HAS_SCROLL_TIMELINE = FORCED === 'js' ? false : PLATFORM_CAN
export const PLATFORM_SUPPORTS = PLATFORM_CAN

export function VariantA({ onOpen }: { onOpen: (b: Beat) => void }) {
  const list = useMemo(() => beats(), [])
  const { index, isMounted } = useScrollWindow(list.length)
  const videoRefs = useRef(new Map<string, HTMLVideoElement>())
  const shotRefs = useRef(new Map<number, HTMLDivElement>())
  const [jsFps, setJsFps] = useState<number | null>(null)

  const totalUnits = (list.length - 1) * STEP + SLOT
  // Percentages are of the scrollable distance — the content minus one
  // viewport — so the last shot lands exactly at the bottom.
  const scrollable = totalUnits - 1

  const plan = useMemo(
    () =>
      list.map((b) => ({
        b,
        kb: kenBurns(b),
        start: (b.i * STEP) / scrollable,
        end: (b.i * STEP + SLOT) / scrollable,
        first: b.i === 0,
        last: b.i === list.length - 1,
      })),
    [list, scrollable],
  )

  // --- path 1: the platform does it -------------------------------------
  const css = useMemo(() => {
    if (!HAS_SCROLL_TIMELINE) return ''
    return plan
      .map(
        ({ b, kb, start, end, first, last }) => `
        #shot-${b.i} {
          animation: shot-${b.i} linear both;
          animation-timeline: scroll(root block);
          animation-range: ${(start * 100).toFixed(4)}% ${(end * 100).toFixed(4)}%;
        }
        @keyframes shot-${b.i} {
          0%   { opacity: ${first ? 1 : 0}; transform: ${transformAt(kb, 0)}; }
          14%  { opacity: 1; }
          86%  { opacity: 1; }
          100% { opacity: ${last ? 1 : 0}; transform: ${transformAt(kb, 1)}; }
        }`,
      )
      .join('\n')
  }, [plan])

  // --- path 2: we do it, because the platform cannot ---------------------
  useEffect(() => {
    if (HAS_SCROLL_TIMELINE) return
    let raf = 0
    let frames = 0
    let last = performance.now()
    let lastY = -1
    const tick = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const y = window.scrollY
      // Standing still costs nothing. Only the frames where the finger has
      // actually moved do any work.
      if (y === lastY) {
        raf = requestAnimationFrame(tick)
        return
      }
      lastY = y
      const t = max > 0 ? y / max : 0
      for (const { b, kb, start, end, first, last: isLast } of plan) {
        const el = shotRefs.current.get(b.i)
        if (!el) continue
        const p = Math.min(1, Math.max(0, (t - start) / (end - start)))
        el.style.opacity = String(opacityAt(p, first, isLast))
        el.style.transform = transformAt(kb, p)
      }
      frames++
      const now = performance.now()
      if (now - last >= 500) {
        setJsFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [plan])

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
      {css && <style>{css}</style>}

      {/* The scroll length. Nothing is painted here; it only makes the page tall. */}
      <div style={{ height: `${totalUnits * 100}svh` }} />

      <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
        {plan.map(({ b, kb, first }) =>
          !isMounted(b.i) ? null : (
            <div
              key={b.item.id}
              id={`shot-${b.i}`}
              ref={(el) => {
                if (el) shotRefs.current.set(b.i, el)
                else shotRefs.current.delete(b.i)
              }}
              onClick={() => onOpen(b)}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: first ? 1 : 0,
                transform: transformAt(kb, 0),
                willChange: 'opacity, transform',
                cursor: 'pointer',
                // Only the shot you are actually looking at may be tapped.
                // Without this, the next shot sits invisibly on top and steals
                // the tap, opening a photo you were not looking at.
                pointerEvents: b.i === index ? 'auto' : 'none',
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

              {/* The Chapter beat: a title card riding in on its own shot. */}
              {b.chapterStart && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'grid',
                    placeItems: 'center',
                    background:
                      'linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.15) 45%, rgba(0,0,0,.55))',
                    textAlign: 'center',
                    color: '#fff',
                  }}
                >
                  <div>
                    {b.i === 0 && (
                      <div
                        style={{
                          font: '500 13px/1 -apple-system, system-ui, sans-serif',
                          letterSpacing: '.22em',
                          textTransform: 'uppercase',
                          opacity: 0.8,
                        }}
                      >
                        {MEMORY_TITLE}
                      </div>
                    )}
                    <div
                      style={{
                        font: '600 40px/1.15 -apple-system, system-ui, sans-serif',
                        marginTop: 14,
                        textShadow: '0 2px 30px rgba(0,0,0,.6)',
                      }}
                    >
                      {b.chapterStart.title}
                    </div>
                    <div
                      style={{
                        font: '400 14px/1 -apple-system, system-ui, sans-serif',
                        marginTop: 12,
                        opacity: 0.75,
                      }}
                    >
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
          {!HAS_SCROLL_TIMELINE && (
            <span style={{ opacity: 0.6 }}> · js-modus{jsFps !== null ? ` ${jsFps}fps` : ''}</span>
          )}
        </div>
      </div>
    </>
  )
}
