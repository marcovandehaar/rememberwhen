import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Memory } from '../catalog/types'
import { SF } from '../title/modes'
import { Press } from '../title/Press'
import { Fotodoos } from './Fotodoos'
import { Dymo } from './Dymo'
import { Hold, LiftedCorners, PRINT_FILTER, PrintGloss } from './Hold'
import { INK, PAPER, WALL } from './wallStyle'
import type { TimelineView } from './timelineView'
import { dateLabel, groupByYear, polaroidCover, remainingBelow } from './timelineData'

// The globe pin's own ring and glow, so a Trip reads the same on the wall.
const PIN_GLOW = '0 0 16px rgba(120,180,255,.55), 0 4px 12px rgba(0,0,0,.6)'

function Arrow({ on, onTap, label, children }: { on: boolean; onTap: () => void; label: string; children: ReactNode }) {
  return (
    <div style={{ pointerEvents: on ? 'auto' : 'none', opacity: on ? 0.7 : 0.15, transition: 'opacity .16s' }}>
      <Press onTap={onTap} label={label} style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, font: `300 34px/1 ${SF}` }}>
        {children}
      </Press>
    </div>
  )
}

/** A Trip's badge on its photo: the globe pin's ring and glow, and the Destination's name. */
function TripBadge({ name }: { name: string }) {
  return (
    <div
      data-testid="trip-badge"
      style={{
        position: 'absolute',
        left: 8,
        bottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px 3px 4px',
        borderRadius: 999,
        background: 'rgba(4,7,15,.62)',
        color: '#fff',
        font: `600 11px/1 ${SF}`,
        maxWidth: 'calc(100% - 16px)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span style={{ width: 10, height: 10, flex: 'none', borderRadius: '50%', border: '2px solid rgba(255,255,255,.9)', boxShadow: PIN_GLOW, background: '#1a2a4a' }} />
      {name}
    </div>
  )
}

const TILTS = [-3.5, 2.5, -1.5, 3.5, -2.5, 1.8]
const DROPS = [0, 30, 10, 38, 6, 22]
const PINCH_COOLDOWN_MS = 500
/** A tapped polaroid lifts this long before its Story opens. */
const LIFT_MS = 190

function Polaroid({ memory, i, active, settledBefore, onSettled, onOpen }: {
  memory: Memory
  i: number
  active: boolean
  settledBefore: boolean
  onSettled: () => void
  onOpen: (m: Memory) => void
}) {
  const tilt = TILTS[i % 6]
  const [settled, setSettled] = useState(settledBefore)
  const [lifting, setLifting] = useState(false)
  // A page's polaroids settle onto the wall the first time it is shown.
  if (active && !settled) setSettled(true)
  useEffect(() => {
    if (settled) onSettled()
  }, [settled, onSettled])

  const timer = useRef<number>(undefined)
  // Leaving mid-lift (the sun button) must not open a Story behind it.
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const open = () => {
    if (lifting) return
    setLifting(true)
    timer.current = window.setTimeout(() => onOpen(memory), LIFT_MS)
  }

  return (
    <motion.div
      initial={settledBefore ? false : { rotate: tilt * 2.6, y: -18, scale: 1.04 }}
      animate={lifting ? { rotate: 0, y: -14, scale: 1.08 } : settled ? { rotate: tilt, y: 0, scale: 1 } : { rotate: tilt * 2.6, y: -18, scale: 1.04 }}
      transition={lifting ? { duration: 0.18, ease: 'easeOut' } : { type: 'spring', stiffness: 220, damping: 15, delay: settled && !settledBefore ? (i % 6) * 0.05 : 0 }}
      style={{ marginTop: DROPS[i % 6], width: 'min(40vw, 300px)', position: 'relative', zIndex: lifting ? 5 : 1 }}
    >
      <Press onTap={open} label={memory.name} style={{ display: 'block', width: '100%' }}>
        <div style={{ position: 'relative', isolation: 'isolate' }}>
          <LiftedCorners />

          <div style={{ background: 'linear-gradient(170deg, #fffef9 0%, #f8f4ea 100%)', padding: '5.5% 5.5% 0', borderRadius: 2, boxShadow: '0 2px 3px rgba(70,45,15,.14), 0 0 0 1px rgba(70,45,15,.05)' }}>
            <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: '#d9cdb8' }}>
              <img
                src={polaroidCover(memory)}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: PRINT_FILTER }}
              />
              <PrintGloss />
              {memory.destination && <TripBadge name={memory.destination.name} />}
            </div>
            <div style={{ padding: '13px 6px 18px', textAlign: 'center' }}>
              <div style={{ font: `600 16px/1.2 ${SF}`, color: INK }}>{memory.name}</div>
              <div style={{ marginTop: 4, font: `400 13px/1.2 ${SF}`, color: INK, opacity: 0.55 }}>{dateLabel(memory.date)}</div>
            </div>
          </div>

          <Hold i={i} tilt={tilt} />
        </div>
      </Press>
    </motion.div>
  )
}

// One year's page: scrolls on its own, and tells you when there is more below.
function YearPage({ year, index, memories, active, view, onOpen }: {
  year: number
  index: number
  memories: Memory[]
  active: boolean
  view: TimelineView
  onOpen: (m: Memory) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [below, setBelow] = useState(0)
  const onSettled = useMemo(() => () => view.markSettled(year), [view, year])
  const settledBefore = view.isSettled(year)

  const measure = () => {
    const el = ref.current
    if (!el) return
    const rows = [...el.querySelectorAll<HTMLElement>('[data-snap]')].map((n) => ({ top: n.offsetTop, height: n.offsetHeight }))
    setBelow(remainingBelow(rows, el.scrollTop, el.clientHeight))
  }
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = view.scrollOf(year)
    measure()
  }, [memories.length]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })

  return (
    <section aria-label={String(year)} style={{ flex: 'none', width: '100vw', height: '100%', scrollSnapAlign: 'start', position: 'relative', overflow: 'hidden' }}>
      {/* the huge year, drifting slower than the page */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '17vh',
          textAlign: 'center',
          font: `800 min(40vw, 420px)/1 ${SF}`,
          letterSpacing: '-.05em',
          color: 'rgba(90,60,25,.07)',
          pointerEvents: 'none',
          transform: `translateX(calc((var(--sx, 0px) - ${index} * 100vw) * .45))`,
          willChange: 'transform',
        }}
      >
        {year}
      </div>
      <div
        ref={ref}
        onScroll={(ev) => {
          view.setScroll(year, ev.currentTarget.scrollTop)
          measure()
        }}
        style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <div
          style={{
            maxWidth: 1000,
            margin: '0 auto',
            padding: 'calc(124px + env(safe-area-inset-top)) 4vw 150px',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '40px 4.5vw',
          }}
        >
          {memories.map((m, k) => (
            <div key={m.id} data-snap>
              <Polaroid memory={m} i={k} active={active} settledBefore={settledBefore} onSettled={onSettled} onOpen={onOpen} />
            </div>
          ))}
        </div>
      </div>
      {/* the paper fades in at the bottom edge, and says how many are still below */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, background: `linear-gradient(rgba(243,235,221,0), ${PAPER} 88%)`, pointerEvents: 'none', zIndex: 6 }} />
      <AnimatePresence>
        {below > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18 }}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(72px + env(safe-area-inset-bottom))', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 7 }}
          >
            <motion.span
              animate={{ y: [0, 5, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(42,32,24,.82)', color: PAPER, font: `600 14px/1 ${SF}` }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />
              </svg>
              <span data-testid="more-below">nog {below}</span>
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** "Door de jaren": one page per year, swiped sideways, on a wall of polaroids. Opens on the newest year. */
export function Timeline({ memories, view, onOpen }: { memories: Memory[]; view: TimelineView; onOpen: (m: Memory) => void }) {
  const pages = useMemo(() => groupByYear(memories), [memories])
  const last = pages.length - 1
  const pager = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(() => Math.min(view.page ?? last, last))
  // While an arrow's smooth scroll is under way, scroll events must not pull the page back to the old year.
  const heading = useRef<number | null>(null)
  const [overview, setOverview] = useState(false)
  // Pinch inertia keeps delivering events after the overview closed; they must not reopen it.
  const quietUntil = useRef(0)
  const overviewOpen = useRef(false)
  const showOverview = (open: boolean) => {
    overviewOpen.current = open
    if (!open) quietUntil.current = Date.now() + PINCH_COOLDOWN_MS
    setOverview(open)
  }

  const jumpTo = (p: number, smooth = false) => {
    const el = pager.current
    if (!el) return
    heading.current = smooth ? p : null
    el.scrollTo({ left: el.clientWidth * p, behavior: smooth ? 'smooth' : 'instant' })
    setPage(p)
    view.showPage(p)
  }
  useLayoutEffect(() => {
    jumpTo(page)
  }, [pages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = pager.current
    if (!el) return
    el.style.setProperty('--sx', `${el.scrollLeft}px`)
    const p = Math.round(el.scrollLeft / el.clientWidth)
    if (heading.current !== null) {
      if (p !== heading.current) return
      heading.current = null
    }
    if (p !== page) {
      setPage(p)
      view.showPage(p)
    }
  }

  // Pinching the wall (Safari's gesture events; ctrl+wheel is a trackpad pinch on desktop) opens the overview too.
  useEffect(() => {
    const onGesture = (ev: Event) => {
      if (!overviewOpen.current && Date.now() >= quietUntil.current && (ev as Event & { scale: number }).scale < 0.8) showOverview(true)
    }
    const onWheel = (ev: WheelEvent) => {
      if (ev.ctrlKey && ev.deltaY > 4) {
        ev.preventDefault()
        if (!overviewOpen.current && Date.now() >= quietUntil.current) showOverview(true)
      }
    }
    document.addEventListener('gesturechange', onGesture)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      document.removeEventListener('gesturechange', onGesture)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, ...WALL, color: INK, fontFamily: SF, userSelect: 'none' }}>
      <motion.div
        inert={overview}
        animate={overview ? { scale: 0.82, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: 0 }}
      >
      <div ref={pager} onScroll={onScroll} style={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
        {pages.map((p, i) => (
          <YearPage key={p.year} year={p.year} index={i} memories={p.memories} active={i === page} view={view} onOpen={onOpen} />
        ))}
      </div>

      {/* the year on its label, and the neighbours */}
      <div style={{ position: 'absolute', top: 'calc(22px + env(safe-area-inset-top))', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, pointerEvents: 'none' }}>
        <Arrow on={page > 0} onTap={() => jumpTo(page - 1, true)} label="Vorig jaar">‹</Arrow>
        <h2 style={{ margin: 0, pointerEvents: 'auto' }}>
          <Press onTap={() => showOverview(true)} label={`Jaar ${pages[page]?.year}, toon alle jaren`}>
            <Dymo hint>{pages[page]?.year}</Dymo>
          </Press>
        </h2>
        <Arrow on={page < last} onTap={() => jumpTo(page + 1, true)} label="Volgend jaar">›</Arrow>
      </div>
      </motion.div>

      <AnimatePresence>
        {overview && (
          <Fotodoos
            pages={pages}
            current={page}
            onPick={(p) => {
              jumpTo(p)
              showOverview(false)
            }}
            onClose={() => showOverview(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
