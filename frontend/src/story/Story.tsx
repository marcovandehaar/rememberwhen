import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import type { Memory } from '../catalog/types'
import { beats, type Beat } from './beats'
import { kenBurnsTransform, opacityAt } from './kenBurns'
import { buildPlan, chapterTicks } from './plan'
import { HAS_SCROLL_TIMELINE } from './platform'
import { ScrubBar } from './ScrubBar'
import { scrollProgress } from './scrollProgress'
import { useContainerAspect } from './useContainerAspect'
import { useScrollWindow } from './useScrollWindow'

type NaturalSize = { width: number; height: number }
// Assumed until the real image loads and reports its own size — zero
// degrades kenBurnsTransform to identity, which is a safe default.
const FALLBACK_SIZE: NaturalSize = { width: 0, height: 0 }

export function Story({
  memory,
  onOpenItem,
  onBack,
}: {
  memory: Memory
  // startAt: the inline video's own currentTime, so the Lightbox picks up
  // exactly where the muted preview left off — the spec's "tapping doesn't
  // start playback, it's already playing" (#35) means no visible restart.
  onOpenItem: (item: Beat['item'], startAt?: number) => void
  onBack: () => void
}) {
  const list = useMemo(() => beats(memory), [memory])
  const containerAspect = useContainerAspect()
  const shotRefs = useRef(new Map<number, HTMLDivElement>())
  const videoRefs = useRef(new Map<string, HTMLVideoElement>())
  const [sizes, setSizes] = useState<Map<string, NaturalSize>>(new Map())
  // Which Media Items have actually finished loading — separate from `sizes`
  // (photo-only, and also carries the natural size for kenBurns' crop math)
  // because a video needs this signal too, just to know when to stop
  // showing the fast-scroll bar's loading placeholder (#50).
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())

  const { totalUnits, entries: plan } = useMemo(() => buildPlan(list), [list])
  const { index, isMounted } = useScrollWindow(plan)
  const ticks = useMemo(() => chapterTicks(plan), [plan])

  // #50: a drag on ScrubBar scrolls the page itself (setScrollProgress),
  // which must not count as the "real" scroll gesture that closes it —
  // only a scroll that happens while this is false does.
  const isDraggingScrubberRef = useRef(false)
  const [scrubberOpen, setScrubberOpen] = useState(false)

  useEffect(() => {
    if (!scrubberOpen) return
    const onScroll = () => {
      if (!isDraggingScrubberRef.current) setScrubberOpen(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [scrubberOpen])

  const sizeFor = (id: string) => sizes.get(id) ?? FALLBACK_SIZE
  const markLoaded = (id: string) => setLoadedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

  const onImageLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setSizes((prev) => {
      const next = new Map(prev)
      next.set(id, { width: img.naturalWidth, height: img.naturalHeight })
      return next
    })
    markLoaded(id)
  }

  // --- path 1: the platform does it -------------------------------------
  const css = useMemo(() => {
    if (!HAS_SCROLL_TIMELINE) return ''
    return plan
      .map(({ b, start, end, first, last }) => {
        const size = sizeFor(b.item.id)
        const t0 = kenBurnsTransform(b.item.storyRect, size.width, size.height, containerAspect, 0)
        const t1 = kenBurnsTransform(b.item.storyRect, size.width, size.height, containerAspect, 1)
        return `
        #shot-${b.i} {
          animation: shot-${b.i} linear both;
          animation-timeline: scroll(root block);
          animation-range: ${(start * 100).toFixed(4)}% ${(end * 100).toFixed(4)}%;
        }
        @keyframes shot-${b.i} {
          0%   { opacity: ${first ? 1 : 0}; transform: ${t0}; }
          14%  { opacity: 1; }
          86%  { opacity: 1; }
          100% { opacity: ${last ? 1 : 0}; transform: ${t1}; }
        }`
      })
      .join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, sizes, containerAspect])

  // --- path 2: we do it, because the platform cannot ---------------------
  useEffect(() => {
    if (HAS_SCROLL_TIMELINE) return
    let raf = 0
    let lastY = -1
    const tick = () => {
      const y = window.scrollY
      if (y === lastY) {
        raf = requestAnimationFrame(tick)
        return
      }
      lastY = y
      const t = scrollProgress()
      for (const { b, start, end, first, last } of plan) {
        const el = shotRefs.current.get(b.i)
        if (!el) continue
        const p = Math.min(1, Math.max(0, (t - start) / (end - start)))
        const size = sizeFor(b.item.id)
        el.style.opacity = String(opacityAt(p, first, last))
        el.style.transform = kenBurnsTransform(b.item.storyRect, size.width, size.height, containerAspect, p)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, sizes, containerAspect])

  // Only the shot under the finger plays, muted, ADR 0001 ("Video remains an
  // ordinary member of the sequence, muted and autoplaying while in view").
  // Sound only arrives via the Lightbox, where exactly one video is ever open.
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

      <button
        type="button"
        onClick={onBack}
        aria-label="Terug naar de globe"
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          left: 16,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: 'none',
          borderRadius: 999,
          padding: '12px 22px',
          background: 'rgba(0,0,0,.5)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          font: '600 17px/1 -apple-system, system-ui, sans-serif',
          cursor: 'pointer',
        }}
      >
        ← <GlobeIcon size={20} />
      </button>

      <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
        {plan.map(({ b, first }) => {
          if (!isMounted(b.i)) return null
          const size = sizeFor(b.item.id)

          return (
            <div
              key={b.item.id}
              id={`shot-${b.i}`}
              ref={(el) => {
                if (el) shotRefs.current.set(b.i, el)
                else shotRefs.current.delete(b.i)
              }}
              onClick={() => {
                // #50: while the fast-scroll bar is open, the first tap on
                // the photo just dismisses it — it doesn't also open
                // whatever's currently underneath the thumb.
                if (scrubberOpen) {
                  setScrubberOpen(false)
                  return
                }
                if (b.i !== index) return
                onOpenItem(b.item, videoRefs.current.get(b.item.id)?.currentTime)
              }}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: first ? 1 : 0,
                transform: kenBurnsTransform(b.item.storyRect, size.width, size.height, containerAspect, 0),
                willChange: 'opacity, transform',
                cursor: 'pointer',
                // Without this, a slightly-too-fast tap can register as
                // Safari's double-tap-to-zoom instead of a click — zooming
                // the page just as the Lightbox opens on top of it.
                touchAction: 'manipulation',
                // Only the shot actually in view may be tapped — otherwise
                // the next shot sits invisibly on top and steals the tap.
                pointerEvents: b.i === index ? 'auto' : 'none',
              }}
            >
              {b.item.type === 'video' ? (
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(b.item.id, el)
                    else videoRefs.current.delete(b.item.id)
                  }}
                  src={b.item.mediaRef}
                  muted
                  playsInline
                  loop
                  preload="metadata"
                  onLoadedData={() => markLoaded(b.item.id)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <img
                  src={b.item.mediaRef}
                  alt=""
                  onLoad={(e) => onImageLoad(b.item.id, e)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              )}

              {/* #50: covers a not-yet-loaded target while fast-scroll-dragging
                  past it — without this, jumping straight to an unmounted
                  item flashes blank until the request completes. */}
              {!loadedIds.has(b.item.id) && (
                <motion.div
                  aria-hidden
                  style={{ position: 'absolute', inset: 0, background: '#0a0d14' }}
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}

              {b.i === 0 && <ChapterCard memory={memory} />}
            </div>
          )
        })}
      </div>

      <ScrubBar
        open={scrubberOpen}
        onOpenChange={setScrubberOpen}
        chapterTicks={ticks}
        onDraggingChange={(dragging) => {
          isDraggingScrubberRef.current = dragging
        }}
      />
    </>
  )
}

function GlobeIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

const TITLE_SCRIM: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.15) 45%, rgba(0,0,0,.55))',
  textAlign: 'center',
  color: '#fff',
  pointerEvents: 'none',
}

const TITLE_LABEL: React.CSSProperties = {
  font: '500 13px/1 "JetBrains Mono", monospace',
  letterSpacing: '.22em',
  textTransform: 'uppercase',
  opacity: 0.8,
}

// Two animated treatments, picked once per viewing rather than one fixed
// style — both survived a /prototype comparison against a third (a serif
// word-by-word rise), see the prototype branch for that one.
function ChapterCard({ memory }: { memory: Memory }) {
  const [style] = useState<'cascade' | 'reveal'>(() => (Math.random() < 0.5 ? 'cascade' : 'reveal'))
  return style === 'cascade' ? <CascadeTitle memory={memory} /> : <RevealTitle memory={memory} />
}

// Letters spring in with a small per-letter wobble, playful and bouncy.
function CascadeTitle({ memory }: { memory: Memory }) {
  const letters = useMemo(() => memory.name.split(''), [memory.name])
  // Stable per-letter wobble, computed once so it doesn't reshuffle on rerender.
  const wobble = useRef(letters.map(() => (Math.random() * 14 - 7).toFixed(1))).current

  const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.035, delayChildren: 0.1 } },
  }
  const letter = (rotate: string): Variants => ({
    hidden: { opacity: 0, y: -26, rotate: `${-Number(rotate)}deg`, scale: 0.7 },
    visible: { opacity: 1, y: 0, rotate: '0deg', scale: 1, transition: { type: 'spring', stiffness: 420, damping: 15 } },
  })
  const badge: Variants = {
    hidden: { opacity: 0, scale: 0.7 },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 14, delay: 0.05 } },
  }

  return (
    <div style={TITLE_SCRIM}>
      <div>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={badge}
          style={{
            display: 'inline-block',
            font: '600 12px/1 "JetBrains Mono", monospace',
            letterSpacing: '.18em',
            textTransform: 'uppercase',
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(255,255,255,.18)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {memory.destinationName}
        </motion.div>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={container}
          style={{
            marginTop: 16,
            fontFamily: '"Fredoka", sans-serif',
            fontWeight: 600,
            fontSize: 42,
            lineHeight: 1.15,
            textShadow: '0 2px 30px rgba(0,0,0,.6)',
          }}
        >
          {letters.map((ch, i) =>
            ch === ' ' ? (
              <span key={i}>&nbsp;</span>
            ) : (
              <motion.span key={i} variants={letter(wobble[i])} style={{ display: 'inline-block' }}>
                {ch}
              </motion.span>
            ),
          )}
        </motion.div>
      </div>
    </div>
  )
}

// The whole title unblurs and settles into place, calmer and more modern.
function RevealTitle({ memory }: { memory: Memory }) {
  const title: Variants = {
    hidden: { opacity: 0, scale: 0.94, filter: 'blur(14px)' },
    visible: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 } },
  }
  const rule: Variants = {
    hidden: { scaleX: 0, opacity: 0 },
    visible: { scaleX: 1, opacity: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.55 } },
  }

  return (
    <div style={TITLE_SCRIM}>
      <div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.75, transition: { duration: 0.4 } }} style={TITLE_LABEL}>
          {memory.destinationName}
        </motion.div>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={title}
          style={{
            marginTop: 14,
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 600,
            fontSize: 42,
            lineHeight: 1.15,
            textShadow: '0 2px 30px rgba(0,0,0,.6)',
          }}
        >
          {memory.name}
        </motion.div>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={rule}
          style={{ height: 2, width: 64, background: 'rgba(255,255,255,.6)', margin: '16px auto 0', transformOrigin: 'center' }}
        />
      </div>
    </div>
  )
}
