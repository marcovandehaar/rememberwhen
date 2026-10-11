// PROTOTYPE — throwaway code for "Title screen: look, intro and way back" (#58).
// Three structurally different title screens, switchable via ?titleVariant=A|B|C
// on the app root, with a dev-only switcher bar (← / → keys, ↻ replays the
// intro). CSS only: every moving part is a transform or opacity on layered
// gradients; clouds are soft radial-gradient puffs, never an animated blur.
// A) Dageraad  — night turns to dawn, clouds part, sun rises behind the title,
//                two tiles rise out of the cloud bank.
// B) Daling    — fly down through the clouds onto a sea of clouds; two large
//                windows rise out of it; the chosen one expands into the mode.
// C) Horizon   — a line draws, the sun and the title rise from behind it; two
//                medallions sit on the horizon; the chosen one floods the screen.
import { motion, type Transition } from 'framer-motion'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { Memory } from '../catalog/types'
import { CloudField, cloudBank, scatter } from './Clouds3DPrototype'

export type Mode = 'globe' | 'timeline'
type Props = { memories: Memory[]; returningFrom: Mode | null; onChoose: (mode: Mode) => void; names?: ModeNames }

// Candidate names for the two windows, cycled with the "Aa" button (B only).
type ModeNames = { globe: string; timeline: string }
const NAME_SETS: ModeNames[] = [
  { globe: 'De wereld rond', timeline: 'Door de jaren' },
  { globe: 'Waar', timeline: 'Wanneer' },
  { globe: 'Overal', timeline: 'Ooit' },
  { globe: 'Onderweg', timeline: 'Door de jaren' },
  { globe: 'Around the world', timeline: 'Through the years' },
  { globe: 'Wereldbol', timeline: 'Tijdlijn' },
]

const EARTH = 'https://unpkg.com/three-globe/example/img/earth-night.jpg'
const MODE_BG: Record<Mode, string> = { globe: '#04070f', timeline: '#f3ebdd' }
const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1]
const LEAVE_MS = 520

const KEYFRAMES = `
@keyframes rw-earth-spin { from { transform: translateX(0) } to { transform: translateX(-50%) } }
@keyframes rw-drift { from { transform: translateX(-3%) } to { transform: translateX(3%) } }
@keyframes rw-spin { to { transform: rotate(360deg) } }
@keyframes rw-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
`

// ---------------------------------------------------------------- building blocks

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A cloud is a cluster of soft radial-gradient puffs: the softness is baked
// into the gradient, so moving it is a pure compositor transform.
function Cloud({ seed, color = '255,255,255', alpha = 0.92, puffs = 9, style }: {
  seed: number
  color?: string
  alpha?: number
  puffs?: number
  style: CSSProperties
}) {
  const shapes = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: puffs }, () => {
      const s = 0.3 + r() * 0.4
      return { x: r() * (1 - s), y: 0.35 + r() * 0.3, s }
    })
  }, [seed, puffs])
  return (
    <div style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
      {shapes.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            width: `${p.s * 100}%`,
            aspectRatio: '1.6',
            transform: 'translateY(-50%)',
            borderRadius: '50%',
            background: `radial-gradient(closest-side, rgba(${color},${alpha}) 0%, rgba(${color},${alpha * 0.55}) 50%, rgba(${color},0) 100%)`,
          }}
        />
      ))}
    </div>
  )
}

// The globe pin's own ring and glow (Globe.tsx), spinning a strip of the same
// night-earth texture behind a round mask.
function MiniEarth({ size, ring = true }: { size: number | string; ring?: boolean }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        flex: 'none',
        border: ring ? '2px solid rgba(255,255,255,.9)' : undefined,
        boxShadow: '0 0 16px rgba(120,180,255,.55), 0 4px 12px rgba(0,0,0,.6)',
        background: '#04070f',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '400%',
          height: '100%',
          backgroundImage: `url(${EARTH})`,
          backgroundSize: '50% 100%',
          backgroundRepeat: 'repeat-x',
          animation: 'rw-earth-spin 60s linear infinite',
          willChange: 'transform',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 32% 28%, rgba(255,255,255,.16), transparent 42%), radial-gradient(circle, transparent 52%, rgba(0,0,0,.7) 100%)',
        }}
      />
    </div>
  )
}

function useCovers(memories: Memory[], n: number) {
  return useMemo(() => {
    const covers = memories.map((m) => m.coverImage)
    if (covers.length === 0) return []
    return Array.from({ length: n }, (_, i) => covers[i % covers.length])
  }, [memories, n])
}

function useYears(memories: Memory[]) {
  return useMemo(() => {
    const ys = memories
      .flatMap((m) => m.chapters.flatMap((c) => c.mediaItems.map((i) => i.capturedAt)))
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getFullYear())
    if (ys.length === 0) return null
    return { from: Math.min(...ys), to: Math.max(...ys) }
  }, [memories])
}

const trips = (n: number) => (n === 1 ? '1 reis' : `${n} reizen`)

function yearsLabel(y: { from: number; to: number } | null) {
  if (!y) return ''
  return y.from === y.to ? `${y.from}` : `${y.from} – ${y.to}`
}

// Three polaroids fanned out: the timeline's motif.
function CoverFan({ covers, size }: { covers: string[]; size: number }) {
  const rot = [-9, 1, 10]
  const off = [-0.42, 0, 0.42]
  return (
    <div style={{ position: 'relative', width: size * 1.7, height: size * 1.05 }}>
      {covers.slice(0, 3).map((src, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: size * 0.78,
            padding: `${size * 0.04}px ${size * 0.04}px ${size * 0.13}px`,
            background: '#fbf8f2',
            borderRadius: 3,
            boxShadow: '0 6px 16px rgba(0,0,0,.35)',
            transform: `translate(-50%,-50%) translateX(${off[i] * size}px) rotate(${rot[i]}deg)`,
            zIndex: i === 1 ? 2 : 1,
          }}
        >
          <img src={src} style={{ display: 'block', width: '100%', aspectRatio: '1', objectFit: 'cover' }} />
        </div>
      ))}
    </div>
  )
}

function Press({ onTap, children, style }: { onTap: () => void; children: ReactNode; style?: CSSProperties }) {
  return (
    <motion.button
      onClick={onTap}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ all: 'unset', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', ...style }}
    >
      {children}
    </motion.button>
  )
}

function useLeave(onChoose: (m: Mode) => void) {
  const [leaving, setLeaving] = useState<Mode | null>(null)
  const choose = (m: Mode) => {
    if (leaving) return
    setLeaving(m)
    window.setTimeout(() => onChoose(m), LEAVE_MS)
  }
  return { leaving, choose }
}

const SCREEN: CSSProperties = { position: 'fixed', inset: 0, overflow: 'hidden', userSelect: 'none' }

// Coming back from a mode: start covered in that mode's colour and lift it,
// so the way back mirrors the way in.
function ReturnVeil({ from }: { from: Mode | null }) {
  if (!from) return null
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ position: 'absolute', inset: 0, background: MODE_BG[from], pointerEvents: 'none', zIndex: 50 }}
    />
  )
}

function LeaveVeil({ to }: { to: Mode | null }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: to ? 1 : 0 }}
      transition={{ duration: LEAVE_MS / 1000, ease: 'easeIn' }}
      style={{ position: 'absolute', inset: 0, background: to ? MODE_BG[to] : 'transparent', pointerEvents: 'none', zIndex: 40 }}
    />
  )
}

// ---------------------------------------------------------------- A) Dageraad

function VariantA({ memories, returningFrom, onChoose }: Props) {
  const { leaving, choose } = useLeave(onChoose)
  const covers = useCovers(memories, 3)
  const years = useYears(memories)
  const back = returningFrom !== null
  const at = (s: number) => (back ? 0 : s)

  const leftClouds = [
    { seed: 1, top: '22%', left: '-6%', width: '62vw', height: '26vh' },
    { seed: 2, top: '38%', left: '4%', width: '52vw', height: '24vh' },
    { seed: 3, top: '30%', left: '-12%', width: '48vw', height: '22vh' },
  ]
  const rightClouds = [
    { seed: 4, top: '24%', left: '46%', width: '62vw', height: '26vh' },
    { seed: 5, top: '40%', left: '42%', width: '56vw', height: '24vh' },
    { seed: 6, top: '31%', left: '60%', width: '50vw', height: '22vh' },
  ]
  const parted = !leaving

  return (
    <div style={{ ...SCREEN, background: 'linear-gradient(#060a1a, #141d44 60%, #26305f)' }}>
      {/* night turns to dawn */}
      <motion.div
        initial={back ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2.6, delay: 0.3, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #34508f 0%, #8c8cc6 38%, #f0a57c 72%, #ffdcae 100%)' }}
      />
      {/* sun + halo */}
      <motion.div
        initial={back ? false : { y: '48vh' }}
        animate={{ y: 0 }}
        transition={{ duration: 2.8, delay: 0.2, ease: EASE_OUT }}
        style={{ position: 'absolute', left: '50%', top: '40%', width: 0, height: 0 }}
      >
        <div style={{ position: 'absolute', width: '110vmin', height: '110vmin', left: '-55vmin', top: '-55vmin', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,214,150,.55), rgba(255,190,130,.18) 55%, rgba(255,180,120,0))' }} />
        <div style={{ position: 'absolute', width: '30vmin', height: '30vmin', left: '-15vmin', top: '-15vmin', borderRadius: '50%', background: 'radial-gradient(closest-side, #fffaf0 0%, #ffe7b0 45%, #ffc77e 78%, rgba(255,190,120,0) 100%)' }} />
      </motion.div>

      {/* title */}
      <motion.div
        initial={back ? false : { opacity: 0, y: 26, scale: 0.97 }}
        animate={leaving ? { opacity: 0, y: -10 } : { opacity: 1, y: 0, scale: 1 }}
        transition={leaving ? { duration: 0.3 } : { duration: 1, delay: at(1.3), ease: EASE_OUT }}
        style={{ position: 'absolute', left: 0, right: 0, top: '27%', textAlign: 'center', color: '#fff' }}
      >
        <div style={{ font: '600 min(13vw, 112px)/1 "Fredoka", sans-serif', letterSpacing: '-.01em', textShadow: '0 4px 40px rgba(170,90,40,.55)' }}>
          rememberwhen
        </div>
        <motion.div
          initial={back ? false : { opacity: 0 }}
          animate={{ opacity: 0.85 }}
          transition={{ duration: 0.8, delay: at(2.0) }}
          style={{ marginTop: 14, font: '600 13px/1 "JetBrains Mono", monospace', letterSpacing: '.32em', textTransform: 'uppercase' }}
        >
          weet je nog?
        </motion.div>
      </motion.div>

      {/* curtain clouds that part to reveal the title, and close again on the way out */}
      {leftClouds.map((c, i) => (
        <motion.div
          key={`l${i}`}
          initial={back ? { x: '-62vw' } : { x: 0 }}
          animate={{ x: parted ? '-62vw' : 0 }}
          transition={parted ? { duration: 2.3, delay: at(0.8 + i * 0.12), ease: [0.45, 0, 0.2, 1] } : { duration: LEAVE_MS / 1000, ease: 'easeIn' }}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <Cloud seed={c.seed} color="255,244,236" style={{ top: c.top, left: c.left, width: c.width, height: c.height }} />
        </motion.div>
      ))}
      {rightClouds.map((c, i) => (
        <motion.div
          key={`r${i}`}
          initial={back ? { x: '62vw' } : { x: 0 }}
          animate={{ x: parted ? '62vw' : 0 }}
          transition={parted ? { duration: 2.3, delay: at(0.8 + i * 0.12), ease: [0.45, 0, 0.2, 1] } : { duration: LEAVE_MS / 1000, ease: 'easeIn' }}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <Cloud seed={c.seed} color="255,244,236" style={{ top: c.top, left: c.left, width: c.width, height: c.height }} />
        </motion.div>
      ))}

      {/* cloud bank the tiles rise out of */}
      <div style={{ position: 'absolute', left: '-10%', right: '-10%', bottom: '-12%', height: '26%', animation: 'rw-drift 14s ease-in-out infinite alternate', zIndex: 3, pointerEvents: 'none' }}>
        <Cloud seed={11} color="255,240,230" puffs={14} style={{ left: 0, width: '60%', top: '20%', height: '90%' }} />
        <Cloud seed={12} color="255,240,230" puffs={14} style={{ left: '40%', width: '60%', top: '28%', height: '90%' }} />
      </div>

      {/* tiles */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: '13%', display: 'flex', justifyContent: 'center', gap: '4vw', zIndex: 2 }}>
        {(['globe', 'timeline'] as const).map((m, i) => (
          <motion.div
            key={m}
            initial={{ opacity: 0, y: back ? 30 : 80 }}
            animate={leaving ? { opacity: leaving === m ? 1 : 0, y: 0, scale: leaving === m ? 1.06 : 0.96 } : { opacity: 1, y: 0, scale: 1 }}
            transition={leaving ? { duration: 0.3 } : { duration: back ? 0.35 : 0.9, delay: at(2.5) + i * 0.1, ease: EASE_OUT }}
          >
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: i * 1.3 }}>
              <Press onTap={() => choose(m)}>
                <div
                  style={{
                    width: 'min(34vw, 300px)',
                    padding: '26px 0 22px',
                    borderRadius: 28,
                    background: 'rgba(40,36,70,.34)',
                    border: '1px solid rgba(255,255,255,.4)',
                    boxShadow: '0 18px 40px rgba(60,30,40,.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 16,
                    color: '#fff',
                  }}
                >
                  <div style={{ height: 120, display: 'grid', placeItems: 'center' }}>
                    {m === 'globe' ? <MiniEarth size={108} /> : <CoverFan covers={covers} size={80} />}
                  </div>
                  <div style={{ font: '600 26px/1 "Fredoka", sans-serif' }}>{m === 'globe' ? 'Wereldbol' : 'Tijdlijn'}</div>
                  <div style={{ font: '600 11px/1 "JetBrains Mono", monospace', letterSpacing: '.2em', opacity: 0.8, textTransform: 'uppercase' }}>
                    {m === 'globe' ? trips(memories.length) : yearsLabel(years)}
                  </div>
                </div>
              </Press>
            </motion.div>
          </motion.div>
        ))}
      </div>

      <LeaveVeil to={leaving} />
      <ReturnVeil from={returningFrom} />
    </div>
  )
}

// ---------------------------------------------------------------- B) Daling

function VariantB({
  memories,
  returningFrom,
  onChoose,
  clouds3d = false,
  titleStyle = 'plain',
  names = NAME_SETS[0],
}: Props & { clouds3d?: boolean; titleStyle?: TitleStyle }) {
  const [leaving, setLeaving] = useState<Mode | null>(null)
  const covers = useCovers(memories, 8)
  const years = useYears(memories)
  const back = returningFrom !== null
  // B2's flight is longer: hold the title and windows until the bank clears
  const at = (s: number) => (back ? 0 : s + (clouds3d ? 1.5 : 0))
  const choose = (m: Mode) => {
    if (leaving) return
    setLeaving(m)
    window.setTimeout(() => onChoose(m), LEAVE_MS + 80)
  }
  const title = 'rememberwhen'.split('')

  // three full-screen cloud layers we fall through, nearest first
  const layers = [
    { seed: 21, scale: 3.4, delay: 0.15 },
    { seed: 22, scale: 2.6, delay: 0.45 },
    { seed: 23, scale: 2.0, delay: 0.75 },
  ]

  const panel = (m: Mode, i: number) => {
    const expanded = leaving === m
    const hidden = leaving !== null && !expanded
    const rect: CSSProperties = expanded
      ? { left: 0, top: 0, width: '100vw', height: '100vh', borderRadius: 0, zIndex: 30 }
      : { left: i === 0 ? '8vw' : '52vw', top: '36vh', width: '40vw', height: '50vh', borderRadius: 26, zIndex: 2 }
    return (
      <motion.div
        key={m}
        layout
        initial={{ y: back ? '12vh' : '70vh', opacity: back ? 0 : 1 }}
        animate={{ y: 0, opacity: hidden ? 0 : 1 }}
        transition={{
          layout: { duration: LEAVE_MS / 1000, ease: [0.65, 0, 0.35, 1] },
          y: { duration: back ? 0.4 : 1.2, delay: at(1.9) + i * 0.12, ease: EASE_OUT },
          opacity: { duration: hidden ? 0.25 : 0.4 },
        }}
        style={{ position: 'absolute', overflow: 'hidden', background: MODE_BG[m], boxShadow: '0 24px 60px rgba(30,20,60,.35)', ...rect }}
      >
        <Press onTap={() => choose(m)} style={{ position: 'absolute', inset: 0 }}>
          {m === 'globe' ? (
            <>
              <div style={{ position: 'absolute', left: '50%', top: '24%', transform: 'translateX(-50%)' }}>
                <MiniEarth size="62vh" ring={false} />
              </div>
              <PanelLabel color="#fff" title={names.globe} sub="Ga je mee?" faded={expanded} />
            </>
          ) : (
            <>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: '30%',
                  display: 'flex',
                  gap: 18,
                  width: 'max-content',
                  animation: 'rw-marquee 30s linear infinite',
                  willChange: 'transform',
                }}
              >
                {[...covers, ...covers].map((src, k) => (
                  <div key={k} style={{ padding: '7px 7px 22px', background: '#fff', borderRadius: 3, boxShadow: '0 6px 14px rgba(80,50,20,.22)', transform: `rotate(${(k % 3) - 1 * 2.5}deg)` }}>
                    <img src={src} style={{ display: 'block', width: 120, height: 120, objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
              <div style={{ position: 'absolute', left: 28, bottom: 26, font: `600 min(7vw, 64px)/1 ${SF}`, letterSpacing: '-.03em', color: '#2a2018', opacity: expanded ? 0 : 0.9, transition: 'opacity .2s' }}>
                {yearsLabel(years)}
              </div>
              <PanelLabel color="#2a2018" title={names.timeline} sub="Weet je nog?" faded={expanded} />
            </>
          )}
        </Press>
      </motion.div>
    )
  }

  return (
    <div style={{ ...SCREEN, background: 'linear-gradient(180deg, #10275a 0%, #4f72b8 45%, #e9b78e 74%, #fde6c8 100%)' }}>
      {/* low sun on the cloud horizon */}
      <div style={{ position: 'absolute', left: '50%', bottom: '24%', width: 0, height: 0 }}>
        <div style={{ position: 'absolute', width: '120vmin', height: '70vmin', left: '-60vmin', top: '-35vmin', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,220,160,.6), rgba(255,200,150,0))' }} />
        <div style={{ position: 'absolute', width: '20vmin', height: '20vmin', left: '-10vmin', top: '-10vmin', borderRadius: '50%', background: 'radial-gradient(closest-side, #fffaf0, #ffd99a 60%, rgba(255,200,130,0))' }} />
      </div>

      {/* title, letter by letter */}
      <motion.div
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.25 }}
        style={{ position: 'absolute', top: '10vh', left: 0, right: 0, textAlign: 'center', color: '#fff', zIndex: 1 }}
      >
        {titleStyle !== 'plain' ? (
          <ShimmerTitle style={titleStyle} delay={at(1.2)} back={back} />
        ) : (
        <div style={{ font: '600 min(10vw, 92px)/1 "Space Grotesk", sans-serif', letterSpacing: '-.02em', textShadow: '0 6px 40px rgba(20,30,80,.35)' }}>
          {title.map((ch, i) => (
            <motion.span
              key={i}
              initial={back ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: at(1.2) + (back ? 0 : i * 0.035), ease: EASE_OUT }}
              style={{ display: 'inline-block' }}
            >
              {ch}
            </motion.span>
          ))}
        </div>
        )}
        <motion.div
          initial={back ? false : { opacity: 0 }}
          animate={{ opacity: 0.85 }}
          transition={{ delay: at(1.9), duration: 0.6 }}
          style={{ marginTop: 12, font: '600 12px/1 "JetBrains Mono", monospace', letterSpacing: '.34em', textTransform: 'uppercase' }}
        >
          weet je nog?
        </motion.div>
      </motion.div>

      {panel('globe', 0)}
      {panel('timeline', 1)}

      {clouds3d && <Clouds3D leaving={leaving} back={back} />}

      {/* sea of clouds in front of the panels' feet */}
      {!clouds3d && <motion.div
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        style={{ position: 'absolute', left: '-10%', right: '-10%', bottom: '-8%', height: '30%', zIndex: 3, pointerEvents: 'none', animation: 'rw-drift 16s ease-in-out infinite alternate' }}
      >
        <Cloud seed={31} color="255,246,238" puffs={16} style={{ left: 0, width: '55%', top: '10%', height: '100%' }} />
        <Cloud seed={32} color="255,240,232" puffs={16} style={{ left: '30%', width: '45%', top: '22%', height: '100%' }} />
        <Cloud seed={33} color="255,246,238" puffs={16} style={{ left: '55%', width: '50%', top: '8%', height: '100%' }} />
      </motion.div>}

      {/* the clouds we descend through */}
      {!back && !clouds3d && (
        <>
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.9, delay: 0.1 }}
            style={{ position: 'absolute', inset: 0, background: '#f6f2ee', zIndex: 20, pointerEvents: 'none' }}
          />
          {layers.map((l) => (
            <motion.div
              key={l.seed}
              initial={{ scale: 1, opacity: 1 }}
              animate={{ scale: l.scale, opacity: 0 }}
              transition={{ duration: 1.7, delay: l.delay, ease: [0.5, 0, 0.75, 0] }}
              style={{ position: 'absolute', inset: '-20%', zIndex: 21, pointerEvents: 'none' }}
            >
              <Cloud seed={l.seed} color="250,247,244" puffs={10} style={{ left: 0, top: '0%', width: '60%', height: '60%' }} />
              <Cloud seed={l.seed + 10} color="250,247,244" puffs={10} style={{ left: '40%', top: '10%', width: '60%', height: '60%' }} />
              <Cloud seed={l.seed + 20} color="250,247,244" puffs={10} style={{ left: '0%', top: '45%', width: '60%', height: '60%' }} />
              <Cloud seed={l.seed + 30} color="250,247,244" puffs={10} style={{ left: '40%', top: '50%', width: '60%', height: '60%' }} />
            </motion.div>
          ))}
        </>
      )}

      <ReturnVeil from={returningFrom} />
    </div>
  )
}

// The title as a stylised word with a glint running over it, after jh3y's
// "Text Shimmer Lines" (codepen.io/jh3y/pen/Exqbaem): the text clips two
// backgrounds, a sky-coloured base and a narrow angled band three times the
// text's width; sliding the band's background-position sweeps the glint
// across, then it rests before the next pass. Colours are the scene's own:
// cloud white into sunset peach, a gold-peach-white-sky-blue glint.
// Fonts were tried and rejected (Fraunces, Yellowtail, Unbounded): the effects
// carry the title, so the type stays Apple-plain — the system font, which is
// SF Pro on the iPad.
type TitleStyle = 'plain' | 'caps' | 'lower' | 'stacked'

const SF = '-apple-system, "SF Pro Display", BlinkMacSystemFont, "Helvetica Neue", system-ui, sans-serif'

// Wide tracking also pads after the last letter; a matching left padding
// keeps the word optically centred.
const TITLE_TEXT: Record<Exclude<TitleStyle, 'plain'>, ReactNode> = {
  caps: (
    <span style={{ font: `200 min(8.6vw, 80px)/1.1 ${SF}`, letterSpacing: '.22em', paddingLeft: '.22em', textTransform: 'uppercase' }}>remember when</span>
  ),
  lower: <span style={{ font: `600 min(11vw, 100px)/1.1 ${SF}`, letterSpacing: '-.045em' }}>remember when</span>,
  stacked: (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', textTransform: 'uppercase' }}>
      <span style={{ font: `300 min(3.6vw, 32px)/1.2 ${SF}`, letterSpacing: '.62em', paddingLeft: '.62em' }}>remember</span>
      <span style={{ font: `800 min(17vw, 150px)/.92 ${SF}`, letterSpacing: '-.03em' }}>when</span>
    </span>
  ),
}

const SHIMMER_CSS = `
.rw-shimmer {
  display: inline-block;
  /* room for italic overhang and script flourishes: the clip stops at the box */
  padding: .06em .22em .12em;
  color: transparent;
  background:
    linear-gradient(105deg,
      #0000 calc(50% - 7%),
      #ffe0a3 calc(50% - 4%),
      #ffb48a calc(50% - 1.5%),
      #ffffff 50%,
      #a9c8ff calc(50% + 2.5%),
      #0000 calc(50% + 6%)) 0 0 / 300% 100% no-repeat,
    linear-gradient(180deg, #ffffff 35%, #ffe7cf 75%, #ffd2ae 100%);
  -webkit-background-clip: text;
  background-clip: text;
  animation: rw-shimmer 5.5s ease-in-out infinite both;
}
@keyframes rw-shimmer {
  0% { background-position: 100% 0, 0 0 }
  45%, 100% { background-position: 0% 0, 0 0 }
}
`

function ShimmerTitle({ style, delay, back }: { style: Exclude<TitleStyle, 'plain'>; delay: number; back: boolean }) {
  return (
    <motion.div
      initial={back ? false : { opacity: 0, y: 34, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 1, delay, ease: EASE_OUT }}
      // a text-shadow would show through the transparent glyphs, so the
      // lift off the sky is a drop-shadow on the wrapper instead
      style={{ filter: 'drop-shadow(0 6px 26px rgba(20,30,80,.4))' }}
    >
      <style>{SHIMMER_CSS}</style>
      {/* first glint lands just after the title settles */}
      <span className="rw-shimmer" style={{ animationDelay: `${delay + 0.7}s` }}>
        {TITLE_TEXT[style]}
      </span>
    </motion.div>
  )
}

// B2: the sea and the descent built from 3D cloud clusters (Clouds3DPrototype).
function Clouds3D({ leaving, back }: { leaving: Mode | null; back: boolean }) {
  const [flown, setFlown] = useState(back)
  useEffect(() => {
    if (back) return
    const t = window.setTimeout(() => setFlown(true), 4000)
    return () => window.clearTimeout(t)
  }, [back])
  const W = window.innerWidth
  const H = window.innerHeight
  const fields = useMemo(
    () => ({
      far: scatter(5, 16, { zNear: -600, zFar: -3200, yNear: 130, yFar: 45, spread: W * 1.7, size: 480 }),
      near: scatter(6, 7, { zNear: 200, zFar: -250, yNear: 250, yFar: 190, spread: W * 1.3, size: 440 }),
      fly: cloudBank(7, { count: 38, depth: 4200, W, H }),
    }),
    [W, H],
  )
  return (
    <>
      {/* far sea, behind the windows */}
      <motion.div animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}>
        <CloudField clouds={fields.far} originY="74%" />
      </motion.div>
      {/* near sea, over the windows' feet */}
      <motion.div animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: 0.2 }} style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
        <CloudField clouds={fields.near} originY="74%" />
      </motion.div>
      {/* the descent: the camera flies through a volume of cloud */}
      {!flown && (
        <>
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.1, delay: 0.1, ease: 'easeIn' }}
            style={{ position: 'absolute', inset: 0, background: '#f6f2ee', zIndex: 20, pointerEvents: 'none' }}
          />
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, delay: 3.1, ease: 'easeIn' }}
            style={{ position: 'absolute', inset: 0, zIndex: 21, pointerEvents: 'none' }}
          >
            <CloudField clouds={fields.fly} sprites={5} worldZ={{ from: 0, to: 4300, duration: 3.6, delay: 0.1 }} />
          </motion.div>
        </>
      )}
    </>
  )
}

function PanelLabel({ color, title, sub, faded }: { color: string; title: string; sub: string; faded: boolean }) {
  return (
    <div style={{ position: 'absolute', left: 28, top: 24, color, opacity: faded ? 0 : 1, transition: 'opacity .2s' }}>
      <div style={{ font: `600 30px/1.1 ${SF}`, letterSpacing: '-.02em' }}>{title}</div>
      <div style={{ marginTop: 6, font: `400 17px/1.2 ${SF}`, opacity: 0.7 }}>{sub}</div>
    </div>
  )
}

// ---------------------------------------------------------------- C) Horizon

function VariantC({ memories, returningFrom, onChoose }: Props) {
  const [leaving, setLeaving] = useState<Mode | null>(null)
  const covers = useCovers(memories, 1)
  const years = useYears(memories)
  const back = returningFrom !== null
  const at = (s: number) => (back ? 0 : s)
  const title = 'rememberwhen'.split('')
  const HORIZON = 58 // % from top
  const MED = 'min(24vmin, 210px)'

  const choose = (m: Mode) => {
    if (leaving) return
    setLeaving(m)
    window.setTimeout(() => onChoose(m), LEAVE_MS + 80)
  }
  // how far a medallion-sized disc must grow to cover the whole screen
  const flood = (2 * Math.hypot(window.innerWidth, window.innerHeight)) / Math.min(window.innerWidth * 0.24, window.innerHeight * 0.24, 210)

  const medallion = (m: Mode, i: number) => (
    <div
      key={m}
      style={{
        position: 'absolute',
        left: i === 0 ? '20%' : '80%',
        top: `${HORIZON}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: leaving === m ? 30 : 4,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: back ? 0.85 : 0.5 }}
        animate={{ opacity: leaving && leaving !== m ? 0 : 1, scale: 1 }}
        transition={leaving ? { duration: 0.25 } : { type: 'spring', stiffness: 260, damping: 20, delay: at(2.7) + i * 0.15 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: i * 1.7 }} style={{ position: 'relative' }}>
          {/* glow that breathes: opacity only */}
          <motion.div
            animate={{ opacity: [0.35, 0.8, 0.35] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.9 }}
            style={{ position: 'absolute', inset: '-30%', borderRadius: '50%', background: `radial-gradient(closest-side, ${m === 'globe' ? 'rgba(120,180,255,.55)' : 'rgba(255,200,140,.55)'}, transparent)`, pointerEvents: 'none' }}
          />
          <Press onTap={() => choose(m)}>
            <div style={{ position: 'relative', width: MED, height: MED }}>
              {m === 'globe' ? (
                <MiniEarth size="100%" />
              ) : (
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,.9)', boxShadow: '0 0 16px rgba(255,200,140,.55), 0 4px 12px rgba(0,0,0,.6)', position: 'relative' }}>
                  {covers[0] && <img src={covers[0]} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  {/* a dial of twelve months */}
                  <div style={{ position: 'absolute', inset: 0, animation: 'rw-spin 80s linear infinite' }}>
                    {Array.from({ length: 12 }, (_, k) => (
                      <div key={k} style={{ position: 'absolute', left: '50%', top: '50%', width: 2, height: '9%', background: 'rgba(255,255,255,.85)', transformOrigin: '50% 0', transform: `rotate(${k * 30}deg) translateY(-480%)` }} />
                    ))}
                  </div>
                </div>
              )}
              {/* the flood: a disc of the mode's colour that grows to cover everything */}
              <motion.div
                initial={false}
                animate={leaving === m ? { scale: flood, opacity: 1 } : { scale: 0.2, opacity: 0 }}
                transition={{ duration: LEAVE_MS / 1000, ease: [0.65, 0, 0.35, 1] }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: MODE_BG[m], pointerEvents: 'none' }}
              />
            </div>
          </Press>
        </motion.div>
        <motion.div onClick={() => choose(m)} animate={{ opacity: leaving ? 0 : 1 }} style={{ marginTop: 'calc(4vmin + 22px)', textAlign: 'center', color: '#f6ece0', cursor: 'pointer' }}>
          <div style={{ font: '500 24px/1 "Fredoka", sans-serif' }}>{m === 'globe' ? 'Wereldbol' : 'Tijdlijn'}</div>
          <div style={{ marginTop: 8, font: '600 10px/1 "JetBrains Mono", monospace', letterSpacing: '.22em', opacity: 0.6, textTransform: 'uppercase' }}>
            {m === 'globe' ? trips(memories.length) : yearsLabel(years)}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )

  return (
    <div style={{ ...SCREEN, background: '#05070e' }}>
      {/* sky above the horizon: everything rising is clipped by it */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${HORIZON}%`, overflow: 'hidden', background: 'linear-gradient(#050914, #121a36 70%, #1e2547)' }}>
        <motion.div
          initial={back ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2.6, delay: 0.6 }}
          style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 70% at 50% 100%, rgba(255,170,110,.75), rgba(200,110,120,.35) 45%, rgba(40,40,90,0) 75%)' }}
        />
        {/* rays */}
        <motion.div
          initial={back ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2, delay: 1.8 }}
          style={{ position: 'absolute', left: '50%', bottom: 0, width: 0, height: 0 }}
        >
          <div
            style={{
              position: 'absolute',
              width: '200vmax',
              height: '200vmax',
              left: '-100vmax',
              top: '-100vmax',
              borderRadius: '50%',
              background: 'repeating-conic-gradient(rgba(255,215,160,.09) 0deg 3deg, transparent 3deg 12deg)',
              WebkitMaskImage: 'radial-gradient(closest-side, black 10%, transparent 70%)',
              maskImage: 'radial-gradient(closest-side, black 10%, transparent 70%)',
              animation: 'rw-spin 120s linear infinite',
            }}
          />
        </motion.div>
        {/* the sun */}
        <motion.div
          initial={back ? false : { y: '40vmin' }}
          animate={{ y: 0 }}
          transition={{ duration: 2.6, delay: 0.5, ease: EASE_OUT }}
          style={{ position: 'absolute', left: '50%', bottom: '-6vmin', width: '28vmin', height: '28vmin', marginLeft: '-14vmin', borderRadius: '50%', background: 'radial-gradient(closest-side, #fff8e8, #ffd79a 55%, #ffb06a 85%, rgba(255,150,90,0))' }}
        />
        {/* thin streaks of cloud across the sun */}
        {[0, 1, 2].map((k) => (
          <div key={k} style={{ position: 'absolute', left: '-20%', right: '-20%', bottom: `${6 + k * 11}%`, height: '9%', animation: `rw-drift ${18 + k * 5}s ease-in-out infinite alternate`, animationDelay: `${-k * 4}s` }}>
            <Cloud seed={41 + k} color="255,205,180" alpha={0.32} puffs={12} style={{ left: `${10 + k * 15}%`, width: '70%', top: 0, height: '100%' }} />
          </div>
        ))}
        {/* title rising from behind the horizon, letter by letter */}
        <motion.div
          animate={{ opacity: leaving ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          style={{ position: 'absolute', left: 0, right: 0, top: '30%', textAlign: 'center', color: '#fff6ea' }}
        >
          <div style={{ font: '500 min(12vw, 104px)/1.1 "Fredoka", sans-serif', display: 'inline-flex', overflow: 'hidden', paddingBottom: 6 }}>
            {title.map((ch, i) => (
              <motion.span
                key={i}
                initial={back ? false : { y: '110%' }}
                animate={{ y: 0 }}
                transition={{ duration: 0.9, delay: at(1.4) + (back ? 0 : i * 0.05), ease: EASE_OUT }}
                style={{ display: 'inline-block', textShadow: '0 0 30px rgba(255,190,120,.5)' }}
              >
                {ch}
              </motion.span>
            ))}
          </div>
          <motion.div
            initial={back ? false : { opacity: 0 }}
            animate={{ opacity: 0.75 }}
            transition={{ delay: at(2.3), duration: 0.8 }}
            style={{ marginTop: 10, font: '600 12px/1 "JetBrains Mono", monospace', letterSpacing: '.34em', textTransform: 'uppercase' }}
          >
            weet je nog?
          </motion.div>
        </motion.div>
      </div>

      {/* the sun's reflection below the line */}
      <motion.div
        initial={back ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 1.6 }}
        style={{ position: 'absolute', left: '50%', top: `${HORIZON}%`, width: '22vmin', height: '30vh', marginLeft: '-11vmin', background: 'radial-gradient(ellipse 50% 100% at 50% 0%, rgba(255,190,120,.35), transparent)', pointerEvents: 'none' }}
      />
      {/* the horizon line */}
      <motion.div
        initial={back ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1, delay: 0.15, ease: EASE_OUT }}
        style={{ position: 'absolute', left: 0, right: 0, top: `${HORIZON}%`, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,220,180,.75) 50%, transparent)' }}
      />

      {medallion('globe', 0)}
      {medallion('timeline', 1)}

      <ReturnVeil from={returningFrom} />
    </div>
  )
}

// ---------------------------------------------------------------- switcher

const VARIANTS = [
  { key: 'A', name: 'Dageraad', C: VariantA },
  { key: 'B', name: 'Daling', C: VariantB },
  { key: 'B2', name: 'Daling · CAPS dun', C: (p: Props) => <VariantB {...p} titleStyle="caps" /> },
  { key: 'B3', name: 'Daling · klein vet', C: (p: Props) => <VariantB {...p} titleStyle="lower" /> },
  { key: 'B4', name: 'Daling · gestapeld', C: (p: Props) => <VariantB {...p} titleStyle="stacked" /> },
  // dropped from the bar (Marco preferred B's flat clouds), kept for the record:
  // { key: 'B3D', name: 'Daling · 3D-wolken', C: (p: Props) => <VariantB {...p} clouds3d /> },
  { key: 'C', name: 'Horizon', C: VariantC },
] as const

function readVariant() {
  const v = new URLSearchParams(location.search).get('titleVariant')
  return VARIANTS.findIndex((x) => x.key === v) >= 0 ? (v as string) : 'A'
}

export function TitleScreenPrototype(props: Props) {
  const [variant, setVariant] = useState(readVariant)
  const [run, setRun] = useState(0)
  const [nameIdx, setNameIdx] = useState(() => {
    const n = Number(new URLSearchParams(location.search).get('names'))
    return Number.isInteger(n) && n >= 0 && n < NAME_SETS.length ? n : 0
  })
  const cycleNames = () => {
    const next = (nameIdx + 1) % NAME_SETS.length
    const url = new URL(location.href)
    url.searchParams.set('names', String(next))
    history.replaceState(null, '', url)
    setNameIdx(next)
  }
  const [replayed, setReplayed] = useState(false)
  const idx = VARIANTS.findIndex((x) => x.key === variant)
  const { C } = VARIANTS[idx]

  const go = (d: number) => {
    const next = VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key
    const url = new URL(location.href)
    url.searchParams.set('titleVariant', next)
    history.replaceState(null, '', url)
    setVariant(next)
    setReplayed(true)
    setRun((r) => r + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'n') cycleNames()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <style>{KEYFRAMES}</style>
      <C key={`${variant}-${run}`} {...props} names={NAME_SETS[nameIdx]} returningFrom={replayed ? null : props.returningFrom} />
      {import.meta.env.DEV && (
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
          <SwitchButton onClick={() => go(-1)}>←</SwitchButton>
          <span style={{ padding: '0 10px', minWidth: 120, textAlign: 'center' }}>
            {variant} · {VARIANTS[idx].name}
          </span>
          <SwitchButton onClick={() => go(1)}>→</SwitchButton>
          <SwitchButton onClick={cycleNames}>Aa</SwitchButton>
          <SwitchButton
            onClick={() => {
              setReplayed(true)
              setRun((r) => r + 1)
            }}
          >
            ↻
          </SwitchButton>
        </div>
      )}
    </>
  )
}

function SwitchButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{ all: 'unset', cursor: 'pointer', width: 34, height: 34, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#2a2a2a' }}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------- the way back

// Same control in both modes: a small sun-over-the-horizon mark, the title
// screen's own motif, in the corner where a back button is expected.
export function BackToTitle({ onBack, light = false }: { onBack: () => void; light?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, delay: 0.35, ease: 'easeOut' }}
      style={{ position: 'fixed', top: 'calc(16px + env(safe-area-inset-top))', left: 16, zIndex: 60 }}
    >
      <Press onTap={onBack}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: light ? 'rgba(42,32,24,.08)' : 'rgba(4,7,15,.55)',
            border: `1px solid ${light ? 'rgba(42,32,24,.25)' : 'rgba(255,255,255,.35)'}`,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={light ? '#2a2018' : '#fff'} strokeWidth="1.8" strokeLinecap="round">
            <path d="M6.5 15a5.5 5.5 0 0 1 11 0" />
            <path d="M3 15h18M12 5.5V7.5M5.3 8.3l1.4 1.4M18.7 8.3l-1.4 1.4" />
            <path d="M7 18.5h10" opacity=".55" />
          </svg>
        </div>
      </Press>
    </motion.div>
  )
}

// Stand-in until "Timeline: pick a year, browse its Memories" has its own prototype.
export function TimelinePlaceholder() {
  return (
    <div style={{ ...SCREEN, background: MODE_BG.timeline, display: 'grid', placeItems: 'center', color: '#2a2018', textAlign: 'center' }}>
      <div>
        <div style={{ font: '600 44px/1 "Space Grotesk", sans-serif' }}>Tijdlijn</div>
        <div style={{ marginTop: 12, font: '600 12px/1.6 "JetBrains Mono", monospace', letterSpacing: '.12em', opacity: 0.6 }}>
          placeholder: komt uit het tijdlijn-prototype
        </div>
      </div>
    </div>
  )
}

// After the title screen hands over, lift the mode's colour off the mode so
// the hand-off reads as one continuous movement.
export function ArriveVeil({ mode }: { mode: Mode }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}
      style={{ position: 'fixed', inset: 0, background: MODE_BG[mode], pointerEvents: 'none', zIndex: 55 }}
    />
  )
}
