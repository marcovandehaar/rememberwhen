// PROTOTYPE — throwaway code for "Timeline: pick a year, browse its Memories" (#59).
// Three structurally different timelines on the real catalogue, switchable via
// ?tl=A|B|C, with Trips switched in or out via ?trips=1|0 (dev-only bar at the
// bottom). Entered from the title screen's "Door de jaren" window.
// A) Jaarstrook   — a strip of years to tap; the chosen year's Memories as
//                   large cards grouped by month. Empty years stay in the strip.
// B) Polaroidwand — one page per year, swiped sideways, a huge year behind
//                   polaroids pinned in a zigzag. Empty years are skipped.
// C) Tijdas       — one continuous line through every year, Memories hanging
//                   left and right, a year index on the edge to jump with.
//                   Empty years are a quiet notch on the line.
// The catalogue only holds Trips so far, so three FAKE Memories (no
// Destination) are made from real Trips' photos, marked "(nep)".
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Memory } from '../catalog/types'

const SF = '-apple-system, "SF Pro Display", BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif'
const PAPER = '#f3ebdd'
const INK = '#2a2018'
const PIN_GLOW = '0 0 16px rgba(120,180,255,.55), 0 4px 12px rgba(0,0,0,.6)' // the globe pin's own ring
const EASE_OUT = [0.16, 1, 0.3, 1] as const

type Entry = { memory: Memory; start: Date; end: Date; trip: boolean; cover: string; fake: boolean }

// ---------------------------------------------------------------- data

function capturedRange(m: Memory): [Date, Date] | null {
  const ts = m.chapters
    .flatMap((c) => c.mediaItems.map((i) => i.capturedAt))
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime())
  if (ts.length === 0) return null
  return [new Date(Math.min(...ts)), new Date(Math.max(...ts))]
}

// The pin thumbnail is 192×144 — too small for a card. Until the Indexer
// writes a mid-size cover, use the same photo's Story rendition.
function bigCover(m: Memory) {
  return m.coverImage.replace(/-thumb\.jpg$/, '-story.jpg')
}

const FAKES = [
  { name: 'Onze nieuwe hond (nep)', date: '2023-05-14', from: 3 },
  { name: 'Eerste schooldag (nep)', date: '2021-09-01', from: 7 },
  { name: 'De verhuizing (nep)', date: '2016-04-09', from: 11 },
]

function buildEntries(memories: Memory[]): Entry[] {
  const real = memories.flatMap((m): Entry[] => {
    const r = capturedRange(m)
    return r ? [{ memory: m, start: r[0], end: r[1], trip: true, cover: bigCover(m), fake: false }] : []
  })
  const fakes = FAKES.flatMap((f, i): Entry[] => {
    const src = real[f.from % Math.max(real.length, 1)]
    if (!src) return []
    const d = new Date(f.date)
    const memory = { ...src.memory, id: `fake-${i}`, name: f.name, destinationName: '', chapters: src.memory.chapters.slice(0, 1) } as Memory
    return [{ memory, start: d, end: d, trip: false, cover: src.cover, fake: true }]
  })
  return [...real, ...fakes].sort((a, b) => a.start.getTime() - b.start.getTime())
}

const MONTH = new Intl.DateTimeFormat('nl-NL', { month: 'long' })
const DAY_MONTH = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' })
const DAY_MON = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' })

function dateLabel(e: Entry) {
  const a = e.start
  const b = e.end
  const sameDay = a.toDateString() === b.toDateString()
  if (sameDay) return DAY_MONTH.format(a)
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${DAY_MONTH.format(b)}`
  return `${DAY_MON.format(a)} – ${DAY_MON.format(b)}`
}

function useYears(entries: Entry[]) {
  return useMemo(() => {
    const byYear = new Map<number, Entry[]>()
    for (const e of entries) {
      const y = e.start.getFullYear()
      byYear.set(y, [...(byYear.get(y) ?? []), e])
    }
    const filled = [...byYear.keys()].sort((a, b) => a - b)
    const first = filled[0] ?? new Date().getFullYear()
    const last = Math.max(filled[filled.length - 1] ?? first, new Date().getFullYear())
    const all = Array.from({ length: last - first + 1 }, (_, i) => first + i)
    return { byYear, filled, all }
  }, [entries])
}

// ---------------------------------------------------------------- shared bits

function TripBadge({ e, small = false }: { e: Entry; small?: boolean }) {
  if (!e.trip) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: small ? 8 : 12,
        bottom: small ? 8 : 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: small ? '3px 8px 3px 4px' : '4px 10px 4px 5px',
        borderRadius: 999,
        background: 'rgba(4,7,15,.62)',
        color: '#fff',
        font: `600 ${small ? 11 : 13}px/1 ${SF}`,
        maxWidth: 'calc(100% - 24px)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span style={{ width: small ? 10 : 12, height: small ? 10 : 12, flex: 'none', borderRadius: '50%', border: '2px solid rgba(255,255,255,.9)', boxShadow: PIN_GLOW, background: '#1a2a4a' }} />
      {e.memory.destinationName}
    </div>
  )
}

function Tap({ onTap, children, style }: { onTap: () => void; children: ReactNode; style?: CSSProperties }) {
  return (
    <motion.button
      onClick={onTap}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ all: 'unset', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', display: 'block', ...style }}
    >
      {children}
    </motion.button>
  )
}

function Photo({ src, ratio, radius = 0 }: { src: string; ratio: string; radius?: number }) {
  return (
    <div style={{ position: 'relative', aspectRatio: ratio, overflow: 'hidden', borderRadius: radius, background: '#d9cdb8' }}>
      <img src={src} loading="lazy" decoding="async" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  )
}

type VariantProps = { entries: Entry[]; onOpen: (m: Memory) => void }

const SCREEN: CSSProperties = { position: 'fixed', inset: 0, background: PAPER, color: INK, fontFamily: SF, userSelect: 'none' }

// ---------------------------------------------------------------- A) Jaarstrook

function VariantA({ entries, onOpen }: VariantProps) {
  const { byYear, filled, all } = useYears(entries)
  const [year, setYear] = useState(() => filled[filled.length - 1] ?? all[all.length - 1])
  const [dir, setDir] = useState(1)
  const strip = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>(`[data-year="${year}"]`)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [year])

  const pick = (y: number) => {
    setDir(y > year ? 1 : -1)
    setYear(y)
  }
  const list = byYear.get(year) ?? []
  const months = useMemo(() => {
    const m = new Map<number, Entry[]>()
    for (const e of list) m.set(e.start.getMonth(), [...(m.get(e.start.getMonth()) ?? []), e])
    return [...m.entries()]
  }, [list])
  const prev = [...filled].reverse().find((y) => y < year)
  const next = filled.find((y) => y > year)

  return (
    <div style={{ ...SCREEN, display: 'flex', flexDirection: 'column' }}>
      {/* the strip of years */}
      <div style={{ flex: 'none', paddingTop: 'calc(14px + env(safe-area-inset-top))', background: PAPER, boxShadow: '0 1px 0 rgba(42,32,24,.08)' }}>
        <div style={{ textAlign: 'center', font: `600 13px/1 ${SF}`, letterSpacing: '.18em', textTransform: 'uppercase', opacity: 0.5, height: 46, display: 'grid', placeItems: 'center' }}>Door de jaren</div>
        <div ref={strip} style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '6px 50vw 14px', scrollbarWidth: 'none' }}>
          {all.map((y) => {
            const n = byYear.get(y)?.length ?? 0
            const on = y === year
            return (
              <Tap key={y} onTap={() => pick(y)} style={{ flex: 'none' }}>
                <div data-year={y} style={{ padding: '6px 14px', textAlign: 'center', opacity: n ? 1 : 0.28 }}>
                  <div style={{ font: `${on ? 700 : 500} ${on ? 30 : 20}px/1.1 ${SF}`, letterSpacing: '-.02em', transition: 'font-size .16s ease-out' }}>{y}</div>
                  <div style={{ height: 6, marginTop: 4, display: 'flex', justifyContent: 'center', gap: 3 }}>
                    {Array.from({ length: Math.min(n, 5) }, (_, i) => (
                      <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: on ? INK : 'rgba(42,32,24,.45)' }} />
                    ))}
                  </div>
                </div>
              </Tap>
            )
          })}
        </div>
      </div>

      {/* the chosen year */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={year}
            custom={dir}
            initial={{ opacity: 0, x: dir * 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -60 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ maxWidth: 760, margin: '0 auto', padding: '26px 20px 120px' }}
          >
            {list.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: '14vh' }}>
                <div style={{ font: `200 64px/1 ${SF}`, letterSpacing: '.1em', opacity: 0.35 }}>{year}</div>
                <div style={{ marginTop: 18, font: `400 19px/1.4 ${SF}`, opacity: 0.6 }}>Nog niets bewaard uit {year}.</div>
                <div style={{ marginTop: 26, display: 'flex', justifyContent: 'center', gap: 12 }}>
                  {prev && <Chip onTap={() => pick(prev)}>← {prev}</Chip>}
                  {next && <Chip onTap={() => pick(next)}>{next} →</Chip>}
                </div>
              </div>
            ) : (
              months.map(([month, es]) => (
                <section key={month} style={{ marginBottom: 30 }}>
                  <h3 style={{ margin: '0 0 12px 4px', font: `600 15px/1 ${SF}`, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.5 }}>{MONTH.format(new Date(year, month, 1))}</h3>
                  <div style={{ display: 'grid', gap: 22 }}>
                    {es.map((e) => (
                      <Tap key={e.memory.id} onTap={() => onOpen(e.memory)} style={{ width: '100%' }}>
                        <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#fff', boxShadow: '0 10px 30px rgba(80,55,25,.16)' }}>
                          <div style={{ position: 'relative' }}>
                            <Photo src={e.cover} ratio="16 / 9" />
                            <TripBadge e={e} />
                          </div>
                          <div style={{ padding: '14px 18px 16px' }}>
                            <div style={{ font: `600 22px/1.2 ${SF}`, letterSpacing: '-.01em' }}>{e.memory.name}</div>
                            <div style={{ marginTop: 4, font: `400 15px/1.2 ${SF}`, opacity: 0.6 }}>{dateLabel(e)}</div>
                          </div>
                        </div>
                      </Tap>
                    ))}
                  </div>
                </section>
              ))
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function Chip({ onTap, children }: { onTap: () => void; children: ReactNode }) {
  return (
    <Tap onTap={onTap}>
      <span style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 999, border: '1px solid rgba(42,32,24,.25)', font: `600 16px/1 ${SF}` }}>{children}</span>
    </Tap>
  )
}

// ---------------------------------------------------------------- B) Polaroidwand

function VariantB({ entries, onOpen }: VariantProps) {
  const { byYear, filled } = useYears(entries)
  const pager = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(filled.length - 1)

  // open on the most recent year
  useLayoutEffect(() => {
    const el = pager.current
    if (el) el.scrollLeft = el.clientWidth * (filled.length - 1)
  }, [filled.length])

  const onScroll = () => {
    const el = pager.current
    if (el) setPage(Math.round(el.scrollLeft / el.clientWidth))
  }
  const go = (p: number) => pager.current?.scrollTo({ left: pager.current.clientWidth * p, behavior: 'smooth' })

  return (
    <div style={SCREEN}>
      <div
        ref={pager}
        onScroll={onScroll}
        style={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
      >
        {filled.map((y) => (
          <div key={y} style={{ flex: 'none', width: '100vw', height: '100%', scrollSnapAlign: 'start', position: 'relative', overflowY: 'auto' }}>
            {/* the year, huge, behind everything */}
            <div style={{ position: 'sticky', top: 0, height: 0, zIndex: 0 }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: '18vh', textAlign: 'center', font: `800 min(40vw, 420px)/1 ${SF}`, letterSpacing: '-.05em', color: 'rgba(42,32,24,.065)', pointerEvents: 'none' }}>{y}</div>
            </div>
            <div
              style={{
                position: 'relative',
                zIndex: 1,
                maxWidth: 980,
                margin: '0 auto',
                padding: 'calc(110px + env(safe-area-inset-top)) 4vw 140px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '34px 4vw',
              }}
            >
              {(byYear.get(y) ?? []).map((e, i) => (
                <Polaroid key={e.memory.id} e={e} i={i} onOpen={onOpen} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* which year, and the way to the neighbours */}
      <div style={{ position: 'absolute', top: 'calc(18px + env(safe-area-inset-top))', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, pointerEvents: 'none' }}>
        <Arrow on={page > 0} onTap={() => go(page - 1)}>‹</Arrow>
        <div style={{ font: `200 34px/1 ${SF}`, letterSpacing: '.22em', paddingLeft: '.22em', minWidth: 150, textAlign: 'center' }}>{filled[page]}</div>
        <Arrow on={page < filled.length - 1} onTap={() => go(page + 1)}>›</Arrow>
      </div>
    </div>
  )
}

function Arrow({ on, onTap, children }: { on: boolean; onTap: () => void; children: ReactNode }) {
  return (
    <div style={{ pointerEvents: on ? 'auto' : 'none', opacity: on ? 0.7 : 0.15, transition: 'opacity .16s' }}>
      <Tap onTap={onTap}>
        <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, font: `300 34px/1 ${SF}` }}>{children}</span>
      </Tap>
    </div>
  )
}

function Polaroid({ e, i, onOpen }: { e: Entry; i: number; onOpen: (m: Memory) => void }) {
  const tilt = [-3.5, 2.5, -1.5, 3.5, -2.5, 1.5][i % 6]
  const drop = [0, 26, 8, 34, 4, 20][i % 6]
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotate: tilt * 2 }}
      whileInView={{ opacity: 1, y: 0, rotate: tilt }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay: (i % 3) * 0.06 }}
      style={{ marginTop: drop, width: 'min(40vw, 300px)' }}
    >
      <Tap onTap={() => onOpen(e.memory)} style={{ width: '100%' }}>
        <div style={{ position: 'relative', background: '#fffdf8', padding: '12px 12px 0', boxShadow: '0 12px 26px rgba(80,55,25,.22), 0 2px 4px rgba(80,55,25,.12)', borderRadius: 2 }}>
          {/* the pin it hangs from */}
          <span style={{ position: 'absolute', top: -7, left: '50%', marginLeft: -7, width: 14, height: 14, borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #ff9b7a, #c4452b)', boxShadow: '0 2px 3px rgba(0,0,0,.3)' }} />
          <div style={{ position: 'relative' }}>
            <Photo src={e.cover} ratio="1" />
            <TripBadge e={e} small />
          </div>
          <div style={{ padding: '12px 4px 16px', textAlign: 'center' }}>
            <div style={{ font: `600 16px/1.2 ${SF}` }}>{e.memory.name}</div>
            <div style={{ marginTop: 3, font: `400 13px/1.2 ${SF}`, opacity: 0.55 }}>{dateLabel(e)}</div>
          </div>
        </div>
      </Tap>
    </motion.div>
  )
}

// ---------------------------------------------------------------- C) Tijdas

function VariantC({ entries, onOpen }: VariantProps) {
  const { byYear, filled, all } = useYears(entries)
  const scroller = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(filled[filled.length - 1])

  // oldest at the top, opens at the newest year
  useLayoutEffect(() => {
    const y = filled[filled.length - 1]
    const el = scroller.current?.querySelector<HTMLElement>(`[data-year="${y}"]`)
    if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 40
  }, [filled])

  const jump = (y: number) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-year="${y}"]`)
    if (el && scroller.current) scroller.current.scrollTop = el.offsetTop - 40
  }
  const onScroll = () => {
    const s = scroller.current
    if (!s) return
    const heads = [...s.querySelectorAll<HTMLElement>('[data-year]')]
    const top = s.scrollTop + 140
    let y = all[0]
    for (const h of heads) if (h.offsetTop <= top) y = Number(h.dataset.year)
    setCurrent(y)
  }

  // the index on the right edge: drag a finger along it to fly through the years
  const index = useRef<HTMLDivElement>(null)
  const scrub = (clientY: number) => {
    const r = index.current?.getBoundingClientRect()
    if (!r) return
    const t = Math.min(0.999, Math.max(0, (clientY - r.top) / r.height))
    jump(all[Math.floor(t * all.length)])
  }

  let side = 0
  return (
    <div style={SCREEN}>
      <div ref={scroller} onScroll={onScroll} style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto', padding: '110px 64px 50vh 24px' }}>
          {/* the line */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 'calc(50% - 20px)', width: 2, background: 'rgba(42,32,24,.14)' }} />
          {all.map((y) => {
            const es = byYear.get(y) ?? []
            if (es.length === 0) {
              return (
                <div key={y} data-year={y} style={{ position: 'relative', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: -40 }}>
                  <span style={{ background: PAPER, padding: '0 10px', font: `500 14px/1 ${SF}`, opacity: 0.32 }}>{y}</span>
                </div>
              )
            }
            return (
              <section key={y} data-year={y} style={{ position: 'relative', paddingBottom: 30 }}>
                <div style={{ position: 'sticky', top: 'calc(70px + env(safe-area-inset-top))', zIndex: 2, display: 'flex', justifyContent: 'center', marginLeft: -40, pointerEvents: 'none' }}>
                  <span style={{ background: INK, color: PAPER, padding: '8px 18px', borderRadius: 999, font: `700 20px/1 ${SF}`, letterSpacing: '.04em' }}>{y}</span>
                </div>
                <div style={{ paddingTop: 24 }}>
                  {es.map((e) => {
                    const left = side++ % 2 === 0
                    return (
                      <div key={e.memory.id} style={{ position: 'relative', display: 'flex', justifyContent: left ? 'flex-start' : 'flex-end', marginBottom: 26 }}>
                        {/* the knot on the line */}
                        <span style={{ position: 'absolute', top: 40, left: 'calc(50% - 26px)', width: 14, height: 14, borderRadius: '50%', background: e.trip ? '#1a2a4a' : PAPER, border: `2px solid ${e.trip ? 'rgba(255,255,255,.9)' : INK}`, boxShadow: e.trip ? PIN_GLOW : 'none' }} />
                        <motion.div
                          initial={{ opacity: 0, x: left ? -30 : 30 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true, amount: 0.3 }}
                          transition={{ duration: 0.35, ease: EASE_OUT }}
                          style={{ width: 'calc(50% - 52px)', marginLeft: left ? 0 : undefined }}
                        >
                          <Tap onTap={() => onOpen(e.memory)} style={{ width: '100%' }}>
                            <div style={{ borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 8px 22px rgba(80,55,25,.15)' }}>
                              <div style={{ position: 'relative' }}>
                                <Photo src={e.cover} ratio="4 / 3" />
                                <TripBadge e={e} small />
                              </div>
                              <div style={{ padding: '10px 14px 12px' }}>
                                <div style={{ font: `600 17px/1.2 ${SF}` }}>{e.memory.name}</div>
                                <div style={{ marginTop: 3, font: `400 13px/1.2 ${SF}`, opacity: 0.55 }}>{dateLabel(e)}</div>
                              </div>
                            </div>
                          </Tap>
                        </motion.div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {/* year index */}
      <div
        ref={index}
        onPointerDown={(ev) => {
          ev.currentTarget.setPointerCapture(ev.pointerId)
          scrub(ev.clientY)
        }}
        onPointerMove={(ev) => ev.buttons && scrub(ev.clientY)}
        style={{ position: 'absolute', right: 6, top: 'calc(80px + env(safe-area-inset-top))', bottom: 90, width: 44, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', touchAction: 'none', cursor: 'ns-resize' }}
      >
        {all.map((y) => {
          const has = (byYear.get(y)?.length ?? 0) > 0
          const on = y === current
          return (
            <span key={y} style={{ font: `${on ? 700 : 500} ${on ? 13 : 10}px/1 ${SF}`, opacity: on ? 1 : has ? 0.55 : 0.2, transition: 'font-size .12s, opacity .12s' }}>
              {on || y % 5 === 0 ? y : `’${String(y).slice(2)}`}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- D / E) the polaroid wall, all out
// B's wall, worked up: paper with grain and a vignette, polaroids with lifted
// corners, gloss and a faded warm print, held by pins or washi tape; the year
// on an embossed label-maker strip; the huge year drifts slower than the page
// (parallax); polaroids settle when you first arrive on a year; a tapped one
// lifts toward you before its Story opens. Everything below the fold is
// visible — the next row peeks in, the bottom fades into paper, and a small
// "nog 3" cue bobs until you reach the end.
// D adds a washi-tape year strip on the right edge to drag through.
// E hides navigation: tap the year label (or pinch) and the wall zooms out to
// a table of polaroid stacks, one per year.

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
const JAGGED = 'polygon(0 6%, 3% 0, 6% 8%, 9% 0, 91% 0, 94% 7%, 97% 0, 100% 8%, 100% 92%, 97% 100%, 94% 93%, 91% 100%, 9% 100%, 6% 92%, 3% 100%, 0 94%)'

function Dymo({ children, onTap, hint = false }: { children: ReactNode; onTap?: () => void; hint?: boolean }) {
  const label = (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
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
      {hint && (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f4f1ea" strokeWidth="1.6" opacity=".7">
          <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
          <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
          <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
        </svg>
      )}
    </span>
  )
  return onTap ? <Tap onTap={onTap}>{label}</Tap> : label
}

function Snapshot({ e, i, active, onOpen }: { e: Entry; i: number; active: boolean; onOpen: (m: Memory) => void }) {
  const tilt = [-3.5, 2.5, -1.5, 3.5, -2.5, 1.8][i % 6]
  const drop = [0, 30, 10, 38, 6, 22][i % 6]
  const hold = i % 3 // 0 pin, 1 tape on top, 2 tape on two corners
  const [settled, setSettled] = useState(false)
  const [lifting, setLifting] = useState(false)
  useEffect(() => {
    if (active && !settled) setSettled(true)
  }, [active, settled])

  const open = () => {
    if (lifting) return
    setLifting(true)
    window.setTimeout(() => {
      onOpen(e.memory)
      setLifting(false)
    }, 190)
  }

  return (
    <motion.div
      initial={false}
      animate={
        lifting
          ? { rotate: 0, y: -14, scale: 1.08 }
          : settled
            ? { rotate: tilt, y: 0, scale: 1 }
            : { rotate: tilt * 2.6, y: -18, scale: 1.04 }
      }
      transition={lifting ? { duration: 0.18, ease: 'easeOut' } : { type: 'spring', stiffness: 220, damping: 15, delay: settled ? (i % 6) * 0.05 : 0 }}
      style={{ marginTop: drop, width: 'min(40vw, 300px)', position: 'relative', zIndex: lifting ? 5 : 1 }}
    >
      <Tap onTap={open} style={{ width: '100%' }}>
        <div style={{ position: 'relative', isolation: 'isolate' }}>
          {/* lifted corners: two tilted shadows peeking out under the bottom edge */}
          <span style={{ position: 'absolute', zIndex: -1, left: '6%', bottom: 10, width: '42%', height: 20, boxShadow: '0 14px 12px rgba(70,45,15,.32)', transform: 'rotate(-4deg)' }} />
          <span style={{ position: 'absolute', zIndex: -1, right: '6%', bottom: 10, width: '42%', height: 20, boxShadow: '0 14px 12px rgba(70,45,15,.32)', transform: 'rotate(4deg)' }} />

          <div
            style={{
              background: 'linear-gradient(170deg, #fffef9 0%, #f8f4ea 100%)',
              padding: '5.5% 5.5% 0',
              borderRadius: 2,
              boxShadow: '0 2px 3px rgba(70,45,15,.14), 0 0 0 1px rgba(70,45,15,.05)',
            }}
          >
            <div style={{ position: 'relative', aspectRatio: '1', overflow: 'hidden', background: '#d9cdb8' }}>
              <img
                src={e.cover}
                loading="lazy"
                decoding="async"
                draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(.14) saturate(1.06) contrast(.95) brightness(1.02)' }}
              />
              {/* print: a soft edge burn and a gloss */}
              <span style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08), inset 0 0 34px rgba(70,40,10,.22)' }} />
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 38%)' }} />
              <TripBadge e={e} small />
            </div>
            <div style={{ padding: '13px 6px 18px', textAlign: 'center' }}>
              <div style={{ font: `600 16px/1.2 ${SF}`, color: INK }}>{e.memory.name}</div>
              <div style={{ marginTop: 4, font: `400 13px/1.2 ${SF}`, color: INK, opacity: 0.55 }}>{dateLabel(e)}</div>
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
      </Tap>
    </motion.div>
  )
}

function Tape({ bg, style }: { bg: string; style: CSSProperties }) {
  return <span style={{ position: 'absolute', height: 26, background: bg, clipPath: JAGGED, boxShadow: '0 1px 2px rgba(0,0,0,.08)', opacity: 0.92, ...style }} />
}

// One year's page: scrolls on its own, and tells you when there is more below.
function YearPage({ y, i, es, active, onOpen }: { y: number; i: number; es: Entry[]; active: boolean; onOpen: (m: Memory) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [below, setBelow] = useState(0)
  const measure = () => {
    const el = ref.current
    if (!el) return
    const fold = el.scrollTop + el.clientHeight - 60
    const items = [...el.querySelectorAll<HTMLElement>('[data-snap]')]
    setBelow(items.filter((n) => n.offsetTop + n.offsetHeight * 0.55 > fold).length)
  }
  useLayoutEffect(measure, [es.length])
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })

  return (
    <div style={{ flex: 'none', width: '100vw', height: '100%', scrollSnapAlign: 'start', position: 'relative', overflow: 'hidden' }}>
      {/* the huge year, drifting slower than the page */}
      <div
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
          transform: `translateX(calc((var(--sx, 0px) - ${i} * 100vw) * .45))`,
          willChange: 'transform',
        }}
      >
        {y}
      </div>
      <div ref={ref} onScroll={measure} style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
          {es.map((e, k) => (
            <div key={e.memory.id} data-snap>
              <Snapshot e={e} i={k} active={active} onOpen={onOpen} />
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
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" />
              </svg>
              nog {below}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PolaroidWall({ entries, onOpen, nav }: VariantProps & { nav: 'strip' | 'box' }) {
  const { byYear, filled } = useYears(entries)
  const pager = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(filled.length - 1)
  const [boxOpen, setBoxOpen] = useState(false)

  const jumpTo = (p: number, smooth = false) => {
    const el = pager.current
    if (!el) return
    el.scrollTo({ left: el.clientWidth * p, behavior: smooth ? 'smooth' : 'instant' })
    setPage(p)
  }
  useLayoutEffect(() => {
    jumpTo(filled.length - 1)
  }, [filled.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = pager.current
    if (!el) return
    el.style.setProperty('--sx', `${el.scrollLeft}px`)
    const p = Math.round(el.scrollLeft / el.clientWidth)
    if (p !== page) setPage(p)
  }

  // E: pinch the wall (Safari's gesture events; ctrl+wheel is a trackpad pinch on desktop)
  useEffect(() => {
    if (nav !== 'box') return
    const onGesture = (ev: Event) => {
      const scale = (ev as Event & { scale: number }).scale
      if (scale < 0.8) setBoxOpen(true)
    }
    const onWheel = (ev: WheelEvent) => {
      if (ev.ctrlKey && ev.deltaY > 4) {
        ev.preventDefault()
        setBoxOpen(true)
      }
    }
    document.addEventListener('gesturechange', onGesture)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      document.removeEventListener('gesturechange', onGesture)
      window.removeEventListener('wheel', onWheel)
    }
  }, [nav])

  return (
    <div style={{ ...SCREEN, ...WALL }}>
      <motion.div
        animate={boxOpen ? { scale: 0.82, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.26, ease: EASE_OUT }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <div
          ref={pager}
          onScroll={onScroll}
          style={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
        >
          {filled.map((y, i) => (
            <YearPage key={y} y={y} i={i} es={byYear.get(y) ?? []} active={i === page} onOpen={onOpen} />
          ))}
        </div>

        {/* the year on its label, and the neighbours */}
        <div style={{ position: 'absolute', top: 'calc(22px + env(safe-area-inset-top))', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, pointerEvents: 'none' }}>
          <Arrow on={page > 0} onTap={() => jumpTo(page - 1, true)}>‹</Arrow>
          <div style={{ pointerEvents: 'auto' }}>
            <Dymo onTap={nav === 'box' ? () => setBoxOpen(true) : undefined} hint={nav === 'box'}>
              {filled[page]}
            </Dymo>
          </div>
          <Arrow on={page < filled.length - 1} onTap={() => jumpTo(page + 1, true)}>›</Arrow>
        </div>
      </motion.div>

      {nav === 'strip' && <YearStrip years={filled} page={page} onPick={(p) => jumpTo(p)} />}
      {nav === 'box' && (
        <AnimatePresence>
          {boxOpen && (
            <PhotoBox
              years={filled}
              byYear={byYear}
              page={page}
              onPick={(p) => {
                jumpTo(p)
                setBoxOpen(false)
              }}
              onClose={() => setBoxOpen(false)}
            />
          )}
        </AnimatePresence>
      )}
    </div>
  )
}

// D: a strip of washi tape on the right edge, one mark per year; drag along it
// and an embossed year label follows your finger while the wall flies along.
function YearStrip({ years, page, onPick }: { years: number[]; page: number; onPick: (p: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ y: number; p: number } | null>(null)
  const at = (clientY: number) => {
    const r = ref.current!.getBoundingClientRect()
    const t = Math.min(0.999, Math.max(0, (clientY - r.top) / r.height))
    const p = Math.floor(t * years.length)
    setDrag({ y: clientY - r.top, p })
    if (p !== page) onPick(p)
  }
  return (
    <div
      ref={ref}
      onPointerDown={(ev) => {
        ev.currentTarget.setPointerCapture(ev.pointerId)
        at(ev.clientY)
      }}
      onPointerMove={(ev) => drag && at(ev.clientY)}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      style={{
        position: 'absolute',
        right: 14,
        top: 'calc(96px + env(safe-area-inset-top))',
        bottom: 96,
        width: 46,
        touchAction: 'none',
        cursor: 'ns-resize',
      }}
    >
      {/* the tape itself */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'repeating-linear-gradient(0deg, rgba(255,232,170,.72) 0 8px, rgba(255,222,150,.72) 8px 16px)',
          clipPath: 'polygon(8% 0, 50% 1.2%, 92% 0, 100% 100%, 50% 98.8%, 0 100%)',
          boxShadow: '0 1px 3px rgba(0,0,0,.08)',
          transform: 'rotate(.6deg)',
        }}
      />
      <div style={{ position: 'absolute', inset: '14px 0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
        {years.map((y, k) => {
          const on = k === page
          return (
            <span key={y} style={{ position: 'relative', font: `${on ? 800 : 600} ${on ? 13 : 11}px/1 ${SF}`, color: INK, opacity: on ? 1 : 0.55, transition: 'opacity .12s' }}>
              {on && <span style={{ position: 'absolute', left: -13, top: '50%', marginTop: -4, width: 8, height: 8, borderRadius: '50%', background: PINS[0], boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />}
              ’{String(y).slice(2)}
            </span>
          )
        })}
      </div>
      <AnimatePresence>
        {drag && (
          <motion.div
            initial={{ opacity: 0, x: 12, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.9 }}
            transition={{ duration: 0.14 }}
            style={{ position: 'absolute', right: 64, top: drag.y - 22, pointerEvents: 'none' }}
          >
            <Dymo>{years[drag.p]}</Dymo>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// E: the wall zooms out to a table with one stack of polaroids per year.
function PhotoBox({
  years,
  byYear,
  page,
  onPick,
  onClose,
}: {
  years: number[]
  byYear: Map<number, Entry[]>
  page: number
  onPick: (p: number) => void
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      ref={(el) => {
        // open on the year you came from
        const cur = el?.querySelector<HTMLElement>('[data-current]')
        if (el && cur && !el.dataset.placed) {
          el.dataset.placed = '1'
          el.scrollTop = cur.offsetTop - el.clientHeight / 2 + cur.offsetHeight / 2
        }
      }}
      style={{ position: 'absolute', inset: 0, zIndex: 20, overflowY: 'auto', ...WALL }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: 'calc(110px + env(safe-area-inset-top)) 5vw 140px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: '46px 4vw',
        }}
      >
        {years.map((y, k) => {
          const es = byYear.get(y) ?? []
          const stack = es.slice(0, 3)
          return (
            <motion.div
              key={y}
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22, delay: Math.abs(k - page) * 0.025 }}
              onClick={(ev) => ev.stopPropagation()}
              data-current={k === page ? '' : undefined}
            >
              <Tap onTap={() => onPick(k)} style={{ width: '100%' }}>
                <div style={{ position: 'relative', aspectRatio: '0.86', margin: '0 auto', width: '78%' }}>
                  {stack.map((e, s) => (
                    <div
                      key={e.memory.id}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: '#fffdf7',
                        padding: '7% 7% 24%',
                        boxShadow: '0 6px 14px rgba(70,45,15,.22)',
                        transform: `rotate(${[-7, 5, -1][s] ?? 0}deg) translate(${[-6, 6, 0][s] ?? 0}px, ${[4, -2, 0][s] ?? 0}px)`,
                        zIndex: s,
                      }}
                    >
                      <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', background: '#d9cdb8' }}>
                        <img src={e.cover} loading="lazy" decoding="async" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(.14) contrast(.95)' }} />
                      </div>
                    </div>
                  ))}
                  {k === page && <span style={{ position: 'absolute', top: -9, left: '50%', marginLeft: -9, width: 18, height: 18, borderRadius: '50%', zIndex: 9, background: `radial-gradient(circle at 35% 32%, rgba(255,255,255,.75) 0 12%, ${PINS[0]} 40%, rgba(0,0,0,.35) 100%)`, boxShadow: '1px 3px 3px rgba(0,0,0,.3)' }} />}
                </div>
                <div style={{ marginTop: 18, textAlign: 'center' }}>
                  <Dymo>{y}</Dymo>
                  <div style={{ marginTop: 8, font: `400 13px/1 ${SF}`, color: INK, opacity: 0.55 }}>{es.length === 1 ? '1 herinnering' : `${es.length} herinneringen`}</div>
                </div>
              </Tap>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

const VariantD = (p: VariantProps) => <PolaroidWall {...p} nav="strip" />
const VariantE = (p: VariantProps) => <PolaroidWall {...p} nav="box" />

// ---------------------------------------------------------------- switcher

const VARIANTS = [
  { key: 'A', name: 'Jaarstrook', C: VariantA },
  { key: 'B', name: 'Polaroidwand', C: VariantB },
  { key: 'C', name: 'Tijdas', C: VariantC },
  { key: 'D', name: 'Polaroid + strook', C: VariantD },
  { key: 'E', name: 'Polaroid + fotodoos', C: VariantE },
] as const

function param(name: string) {
  return new URLSearchParams(location.search).get(name)
}
function setParam(name: string, value: string) {
  const url = new URL(location.href)
  url.searchParams.set(name, value)
  history.replaceState(null, '', url)
}

export function TimelinePrototype({ memories, hidden, onOpen }: { memories: Memory[]; hidden: boolean; onOpen: (m: Memory) => void }) {
  const [variant, setVariant] = useState(() => (VARIANTS.some((v) => v.key === param('tl')) ? param('tl')! : 'A'))
  const [trips, setTrips] = useState(() => param('trips') !== '0')
  const all = useMemo(() => buildEntries(memories), [memories])
  const entries = useMemo(() => (trips ? all : all.filter((e) => !e.trip)), [all, trips])
  const idx = VARIANTS.findIndex((v) => v.key === variant)
  const { C } = VARIANTS[idx]

  const go = (d: number) => {
    const next = VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key
    setParam('tl', next)
    setVariant(next)
  }
  const toggleTrips = () => {
    setParam('trips', trips ? '0' : '1')
    setTrips(!trips)
  }

  useEffect(() => {
    if (hidden) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 't') toggleTrips()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    // Kept mounted under a Story, only hidden, so coming back lands on the
    // same year and the same scroll position.
    <div style={{ visibility: hidden ? 'hidden' : 'visible', pointerEvents: hidden ? 'none' : 'auto' }}>
      <C key={`${variant}-${trips}`} entries={entries} onOpen={onOpen} />
      {import.meta.env.DEV && !hidden && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(14px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 4,
            borderRadius: 999,
            background: '#111',
            color: '#fff',
            font: '600 12px/1 "JetBrains Mono", monospace',
            boxShadow: '0 4px 16px rgba(0,0,0,.4)',
          }}
        >
          <Btn onClick={() => go(-1)}>←</Btn>
          <span style={{ padding: '0 10px', minWidth: 130, textAlign: 'center' }}>
            {variant} · {VARIANTS[idx].name}
          </span>
          <Btn onClick={() => go(1)}>→</Btn>
          <Btn onClick={toggleTrips} wide>
            {trips ? 'Trips aan' : 'Trips uit'}
          </Btn>
        </div>
      )}
    </div>
  )
}

function Btn({ onClick, children, wide = false }: { onClick: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{ all: 'unset', cursor: 'pointer', height: 34, minWidth: 34, padding: wide ? '0 12px' : 0, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#2a2a2a' }}
    >
      {children}
    </button>
  )
}
