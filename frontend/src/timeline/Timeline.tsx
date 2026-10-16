import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Memory } from '../catalog/types'
import { MODE_BG, SF } from '../title/modes'
import { Press } from '../title/Press'
import type { TimelineView } from './timelineView'
import { dateLabel, groupByYear, polaroidCover, remainingBelow } from './timelineData'

const PAPER = MODE_BG.timeline
const INK = '#2a2018'
// The globe pin's own ring and glow, so a Trip reads the same on the wall.
const PIN_GLOW = '0 0 16px rgba(120,180,255,.55), 0 4px 12px rgba(0,0,0,.6)'

const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .32  0 0 0 0 .22  0 0 0 0 .1  0 0 0 .11 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`
const WALL: CSSProperties = {
  background: `${GRAIN}, radial-gradient(ellipse 120% 90% at 50% 40%, transparent 55%, rgba(120,85,40,.16) 100%), ${PAPER}`,
}
const TAPES = [
  'repeating-linear-gradient(45deg, rgba(255,226,150,.82) 0 7px, rgba(255,214,128,.82) 7px 14px)',
  'repeating-linear-gradient(-45deg, rgba(170,220,205,.8) 0 6px, rgba(150,206,190,.8) 6px 12px)',
  'repeating-linear-gradient(90deg, rgba(246,186,190,.8) 0 5px, rgba(240,170,176,.8) 5px 10px)',
]
const PINS = ['#d4492f', '#2f6fd4', '#e0a51f', '#3f9a5a']
const JAGGED =
  'polygon(0 6%, 3% 0, 6% 8%, 9% 0, 91% 0, 94% 7%, 97% 0, 100% 8%, 100% 92%, 97% 100%, 94% 93%, 91% 100%, 9% 100%, 6% 92%, 3% 100%, 0 94%)'

/** The embossed label-maker strip the year sits on. */
function Dymo({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '9px 16px 9px 20px',
        background: 'linear-gradient(180deg, #2b2f38, #1a1d24)',
        borderRadius: 4,
        boxShadow: '0 3px 8px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.08)',
        color: '#f4f1ea',
        font: `700 22px/1 ${SF}`,
        letterSpacing: '.32em',
        textShadow: '0 1px 0 rgba(255,255,255,.18), 0 -1px 0 rgba(0,0,0,.7)',
        transform: 'rotate(-1.2deg)',
      }}
    >
      {children}
    </span>
  )
}

function Arrow({ on, onTap, label, children }: { on: boolean; onTap: () => void; label: string; children: ReactNode }) {
  return (
    <div style={{ pointerEvents: on ? 'auto' : 'none', opacity: on ? 0.7 : 0.15, transition: 'opacity .16s' }}>
      <Press onTap={onTap} label={label} style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, font: `300 34px/1 ${SF}` }}>
        {children}
      </Press>
    </div>
  )
}

function Tape({ bg, style }: { bg: string; style: CSSProperties }) {
  return <span style={{ position: 'absolute', height: 26, background: bg, clipPath: JAGGED, boxShadow: '0 1px 2px rgba(0,0,0,.08)', opacity: 0.92, ...style }} />
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
  const hold = i % 3 // 0 pin, 1 tape on top, 2 tape on two corners
  const [settled, setSettled] = useState(settledBefore)
  const [lifting, setLifting] = useState(false)
  // A page's polaroids settle onto the wall the first time it is shown.
  if (active && !settled) setSettled(true)
  useEffect(() => {
    if (settled) onSettled()
  }, [settled, onSettled])

  const open = () => {
    if (lifting) return
    setLifting(true)
    window.setTimeout(() => onOpen(memory), LIFT_MS)
  }

  return (
    <motion.div
      initial={false}
      animate={lifting ? { rotate: 0, y: -14, scale: 1.08 } : settled ? { rotate: tilt, y: 0, scale: 1 } : { rotate: tilt * 2.6, y: -18, scale: 1.04 }}
      transition={lifting ? { duration: 0.18, ease: 'easeOut' } : { type: 'spring', stiffness: 220, damping: 15, delay: settled && !settledBefore ? (i % 6) * 0.05 : 0 }}
      style={{ marginTop: DROPS[i % 6], width: 'min(40vw, 300px)', position: 'relative', zIndex: lifting ? 5 : 1 }}
    >
      <Press onTap={open} label={memory.name} style={{ display: 'block', width: '100%' }}>
        <div style={{ position: 'relative', isolation: 'isolate' }}>
          {/* lifted corners: two tilted shadows peeking out under the bottom edge */}
          <span style={{ position: 'absolute', zIndex: -1, left: '6%', bottom: 10, width: '42%', height: 20, boxShadow: '0 14px 12px rgba(70,45,15,.32)', transform: 'rotate(-4deg)' }} />
          <span style={{ position: 'absolute', zIndex: -1, right: '6%', bottom: 10, width: '42%', height: 20, boxShadow: '0 14px 12px rgba(70,45,15,.32)', transform: 'rotate(4deg)' }} />

          <div style={{ background: 'linear-gradient(170deg, #fffef9 0%, #f8f4ea 100%)', padding: '5.5% 5.5% 0', borderRadius: 2, boxShadow: '0 2px 3px rgba(70,45,15,.14), 0 0 0 1px rgba(70,45,15,.05)' }}>
            <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: '#d9cdb8' }}>
              <img
                src={polaroidCover(memory)}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(.14) saturate(1.06) contrast(.95) brightness(1.02)' }}
              />
              {/* print: a soft edge burn and a gloss */}
              <span style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08), inset 0 0 34px rgba(70,40,10,.22)' }} />
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 38%)' }} />
              {memory.destination && <TripBadge name={memory.destination.name} />}
            </div>
            <div style={{ padding: '13px 6px 18px', textAlign: 'center' }}>
              <div style={{ font: `600 16px/1.2 ${SF}`, color: INK }}>{memory.name}</div>
              <div style={{ marginTop: 4, font: `400 13px/1.2 ${SF}`, color: INK, opacity: 0.55 }}>{dateLabel(memory.date)}</div>
            </div>
          </div>

          {/* what holds it to the wall */}
          {hold === 0 && (
            <span
              style={{
                position: 'absolute',
                top: -8,
                left: '50%',
                marginLeft: -8,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: `radial-gradient(circle at 35% 32%, rgba(255,255,255,.75) 0 12%, ${PINS[i % PINS.length]} 40%, rgba(0,0,0,.35) 100%)`,
                boxShadow: '1px 3px 3px rgba(0,0,0,.3)',
              }}
            />
          )}
          {hold === 1 && <Tape bg={TAPES[i % TAPES.length]} style={{ top: -13, left: '50%', width: '34%', transform: `translateX(-50%) rotate(${-tilt * 0.8}deg)` }} />}
          {hold === 2 && (
            <>
              <Tape bg={TAPES[(i + 1) % TAPES.length]} style={{ top: -6, left: -18, width: '28%', transform: 'rotate(-38deg)' }} />
              <Tape bg={TAPES[(i + 1) % TAPES.length]} style={{ top: -6, right: -18, width: '28%', transform: 'rotate(38deg)' }} />
            </>
          )}
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

  const jumpTo = (p: number, smooth = false) => {
    const el = pager.current
    if (!el) return
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
    if (p !== page) {
      setPage(p)
      view.showPage(p)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, ...WALL, color: INK, fontFamily: SF, userSelect: 'none' }}>
      <div ref={pager} onScroll={onScroll} style={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
        {pages.map((p, i) => (
          <YearPage key={p.year} year={p.year} index={i} memories={p.memories} active={i === page} view={view} onOpen={onOpen} />
        ))}
      </div>

      {/* the year on its label, and the neighbours */}
      <div style={{ position: 'absolute', top: 'calc(22px + env(safe-area-inset-top))', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, pointerEvents: 'none' }}>
        <Arrow on={page > 0} onTap={() => jumpTo(page - 1, true)} label="Vorig jaar">‹</Arrow>
        <h2 style={{ margin: 0 }}>
          <Dymo>{pages[page]?.year}</Dymo>
        </h2>
        <Arrow on={page < last} onTap={() => jumpTo(page + 1, true)} label="Volgend jaar">›</Arrow>
      </div>
    </div>
  )
}
