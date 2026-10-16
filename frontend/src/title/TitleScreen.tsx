// The title screen (#58): the first thing on every launch. Fly down through
// three layers of flat clouds onto a sea of clouds under a low sun; two
// windows rise out of it, and the chosen one grows into the mode.
// CSS only: every moving part is a transform or opacity on layered gradients,
// never an animated blur, so an older iPad can keep up.
import { motion, type Transition } from 'framer-motion'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Memory } from '../catalog/types'
import { EARTH_TEXTURES } from '../globe/textures'
import { Cloud } from './Cloud'
import { MODE_BG, SF, type Mode } from './modes'
import { Press } from './Press'
import { pickCovers, yearRange, type YearRange } from './titleData'
import './title.css'
import { BackdropBack, BackdropFront } from './titlevisuals/Backdrop'
import { Switcher, useThemeVariant } from './titlevisuals/Switcher'
import type { Theme } from './titlevisuals/themes'

type Props = {
  memories: Memory[]
  /** Set when coming back from a mode: a short reverse onto the settled screen, no intro. */
  returningFrom: Mode | null
  onChoose: (mode: Mode) => void
}

const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1]
const LEAVE_MS = 520
// The intro is over once the windows have settled; until then a tap skips it.
const INTRO_MS = 3300
const COVERS_IN_STRIP = 8

const TITLE_FONT = `200 min(8.6vw, 80px)/1.1 ${SF}`

// The three full-screen cloud layers we fall through, nearest first.
const DESCENT_LAYERS = [
  { seed: 21, scale: 3.4, delay: 0.15 },
  { seed: 22, scale: 2.6, delay: 0.45 },
  { seed: 23, scale: 2.0, delay: 0.75 },
]

// A hand-set tilt per polaroid in the strip; the looks of it were tried on the iPad.
const TILTS = [-2.5, -1.5, -0.5]

const yearsLabel = (years: YearRange | null) =>
  !years ? '' : years.from === years.to ? `${years.from}` : `${years.from} – ${years.to}`

export function TitleScreen({ memories, returningFrom, onChoose }: Props) {
  const [skipped, setSkipped] = useState(false)
  const [introOver, setIntroOver] = useState(false)
  const settled = returningFrom !== null || skipped

  useEffect(() => {
    if (settled) return
    const timer = window.setTimeout(() => setIntroOver(true), INTRO_MS)
    return () => window.clearTimeout(timer)
  }, [settled])

  // Random on every launch, but not re-rolled when the scene remounts after a skip.
  const covers = useMemo(() => pickCovers(memories, COVERS_IN_STRIP), [memories])
  const years = useMemo(() => yearRange(memories), [memories])
  const [theme, pickVariant, variantKey] = useThemeVariant()

  return (
    <>
      <Scene
        key={settled ? 'settled' : 'intro'}
        covers={covers}
        years={years}
        settled={settled}
        returningFrom={returningFrom}
        fadeIn={skipped}
        onChoose={onChoose}
        theme={theme}
      />
      <Switcher current={variantKey} onPick={pickVariant} />
      {!settled && !introOver && (
        <div data-testid="title-skip" onPointerDown={() => setSkipped(true)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
      )}
    </>
  )
}

function Scene({ covers, years, settled, returningFrom, fadeIn, onChoose, theme }: {
  theme: Theme | null
  covers: string[]
  years: YearRange | null
  settled: boolean
  returningFrom: Mode | null
  fadeIn: boolean
  onChoose: (mode: Mode) => void
}) {
  const [leaving, setLeaving] = useState<Mode | null>(null)
  const at = (seconds: number) => (settled ? 0 : seconds)

  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => onChoose(leaving), LEAVE_MS + 80)
    return () => window.clearTimeout(timer)
  }, [leaving, onChoose])

  const choose = (mode: Mode) => setLeaving((current) => current ?? mode)

  return (
    <motion.div
      initial={{ opacity: fadeIn ? 0 : 1 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        userSelect: 'none',
        background: theme?.sky ?? 'linear-gradient(180deg, #10275a 0%, #4f72b8 45%, #e9b78e 74%, #fde6c8 100%)',
        ...(theme ? ({ '--rw-t1': theme.title[0], '--rw-t2': theme.title[1], '--rw-t3': theme.title[2], '--rw-g1': theme.glint[0], '--rw-g2': theme.glint[1], '--rw-g3': theme.glint[2] } as CSSProperties) : {}),
      }}
    >
      {theme && <BackdropBack theme={theme} />}
      {/* low sun on the cloud horizon */}
      {!theme && <div style={{ position: 'absolute', left: '50%', bottom: '24%', width: 0, height: 0 }}>
        <div style={{ position: 'absolute', width: '120vmin', height: '70vmin', left: '-60vmin', top: '-35vmin', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(255,220,160,.6), rgba(255,200,150,0))' }} />
        <div style={{ position: 'absolute', width: '20vmin', height: '20vmin', left: '-10vmin', top: '-10vmin', borderRadius: '50%', background: 'radial-gradient(closest-side, #fffaf0, #ffd99a 60%, rgba(255,200,130,0))' }} />
      </div>}

      <Title delay={at(1.2)} settled={settled} hidden={leaving !== null} />

      <Window mode="globe" index={0} settled={settled} leaving={leaving} onChoose={choose} years={years} covers={covers} />
      <Window mode="timeline" index={1} settled={settled} leaving={leaving} onChoose={choose} years={years} covers={covers} />

      {theme && <BackdropFront theme={theme} />}
      {/* sea of clouds in front of the windows' feet */}
      {!theme && <motion.div
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.2 }}
        style={{ position: 'absolute', left: '-10%', right: '-10%', bottom: '-8%', height: '30%', zIndex: 3, pointerEvents: 'none', animation: 'rw-drift 16s ease-in-out infinite alternate' }}
      >
        <Cloud seed={31} color="255,246,238" puffs={16} style={{ left: 0, width: '55%', top: '10%', height: '100%' }} />
        <Cloud seed={32} color="255,240,232" puffs={16} style={{ left: '30%', width: '45%', top: '22%', height: '100%' }} />
        <Cloud seed={33} color="255,246,238" puffs={16} style={{ left: '55%', width: '50%', top: '8%', height: '100%' }} />
      </motion.div>}

      {/* the clouds we descend through */}
      {!settled && <Descent warm={theme?.key === 'A'} />}

      {returningFrom && <ReturnVeil from={returningFrom} />}
    </motion.div>
  )
}

function Title({ delay, settled, hidden }: { delay: number; settled: boolean; hidden: boolean }) {
  return (
    <motion.div
      animate={{ opacity: hidden ? 0 : 1 }}
      transition={{ duration: 0.25 }}
      style={{ position: 'absolute', top: '10vh', left: 0, right: 0, textAlign: 'center', color: '#fff', zIndex: 1 }}
    >
      <motion.div
        initial={settled ? false : { opacity: 0, y: 34, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1, delay, ease: EASE_OUT }}
        // a text-shadow would show through the transparent glyphs, so the
        // lift off the sky is a drop-shadow on the wrapper instead
        style={{ filter: 'drop-shadow(0 6px 26px rgba(20,30,80,.4))' }}
      >
        <h1
          className="rw-shimmer"
          // wide tracking also pads after the last letter; the matching left padding keeps the word centred
          style={{ margin: 0, font: TITLE_FONT, letterSpacing: '.22em', paddingLeft: '.22em', textTransform: 'uppercase', animationDelay: `${delay + 0.7}s` }}
        >
          Remember when
        </h1>
      </motion.div>
    </motion.div>
  )
}

function Window({ mode, index, settled, leaving, onChoose, years, covers }: {
  mode: Mode
  index: number
  settled: boolean
  leaving: Mode | null
  onChoose: (mode: Mode) => void
  years: YearRange | null
  covers: string[]
}) {
  const expanded = leaving === mode
  const hidden = leaving !== null && !expanded
  const rect: CSSProperties = expanded
    ? { left: 0, top: 0, width: '100vw', height: '100vh', borderRadius: 0, zIndex: 30 }
    : { left: index === 0 ? '8vw' : '52vw', top: '36vh', width: '40vw', height: '50vh', borderRadius: 26, zIndex: 2 }

  return (
    <motion.div
      layout
      initial={{ y: settled ? '12vh' : '70vh', opacity: settled ? 0 : 1 }}
      animate={{ y: 0, opacity: hidden ? 0 : 1 }}
      transition={{
        layout: { duration: LEAVE_MS / 1000, ease: [0.65, 0, 0.35, 1] },
        y: { duration: settled ? 0.4 : 1.2, delay: (settled ? 0 : 1.9) + index * 0.12, ease: EASE_OUT },
        opacity: { duration: hidden ? 0.25 : 0.4 },
      }}
      style={{ position: 'absolute', overflow: 'hidden', background: MODE_BG[mode], boxShadow: '0 24px 60px rgba(30,20,60,.35)', ...rect }}
    >
      <Press onTap={() => onChoose(mode)} style={{ position: 'absolute', inset: 0 }}>
        {mode === 'globe' ? (
          <>
            <div style={{ position: 'absolute', left: '50%', top: '24%', transform: 'translateX(-50%)' }}>
              <MiniEarth size="62vh" />
            </div>
            <WindowLabel color="#fff" title="De wereld rond" sub="Ga je mee?" faded={expanded} />
          </>
        ) : (
          <>
            <CoverStrip covers={covers} />
            <div style={{ position: 'absolute', left: 28, bottom: 26, font: `600 min(7vw, 64px)/1 ${SF}`, letterSpacing: '-.03em', color: '#2a2018', opacity: expanded ? 0 : 0.9, transition: 'opacity .2s' }}>
              {yearsLabel(years)}
            </div>
            <WindowLabel color="#2a2018" title="Door de jaren" sub="Weet je nog?" faded={expanded} />
          </>
        )}
      </Press>
    </motion.div>
  )
}

function WindowLabel({ color, title, sub, faded }: { color: string; title: string; sub: string; faded: boolean }) {
  return (
    <div style={{ position: 'absolute', left: 28, top: 24, color, opacity: faded ? 0 : 1, transition: 'opacity .2s', textAlign: 'left' }}>
      <div style={{ font: `600 30px/1.1 ${SF}`, letterSpacing: '-.02em' }}>{title}</div>
      <div style={{ marginTop: 6, font: `400 17px/1.2 ${SF}`, opacity: 0.7 }}>{sub}</div>
    </div>
  )
}

// The timeline's motif: polaroids sliding past, doubled so the loop is seamless.
function CoverStrip({ covers }: { covers: string[] }) {
  return (
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
        <div
          key={k}
          style={{ padding: '7px 7px 22px', background: '#fff', borderRadius: 3, boxShadow: '0 6px 14px rgba(80,50,20,.22)', transform: `rotate(${TILTS[k % TILTS.length]}deg)` }}
        >
          <img src={src} alt="" style={{ display: 'block', width: 120, height: 120, objectFit: 'cover' }} />
        </div>
      ))}
    </div>
  )
}

// The globe pin's own ring and glow (Globe.tsx), spinning a strip of the same
// night-earth texture behind a round mask.
function MiniEarth({ size }: { size: string }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        position: 'relative',
        flex: 'none',
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
          backgroundImage: `url(${EARTH_TEXTURES.night})`,
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

// Cloud white first, then three layers that swell past the camera and fade.
// PROTOTYPE (#75): with a theme the clouds we fall through take on the scene's golden hour,
// deepening from cream to amber towards the sea of clouds they land in.
const WARM_DESCENT = { veil: '#f6dfb4', layers: ['255,240,212', '255,228,184', '247,206,148'] }
const PLAIN_DESCENT = { veil: '#f6f2ee', layers: ['250,247,244', '250,247,244', '250,247,244'] }

function Descent({ warm }: { warm: boolean }) {
  const look = warm ? WARM_DESCENT : PLAIN_DESCENT
  return (
    <>
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.9, delay: 0.1 }}
        style={{ position: 'absolute', inset: 0, background: look.veil, zIndex: 20, pointerEvents: 'none' }}
      />
      {DESCENT_LAYERS.map((layer, n) => (
        <motion.div
          key={layer.seed}
          initial={{ scale: 1, opacity: 1 }}
          animate={{ scale: layer.scale, opacity: 0 }}
          transition={{ duration: 1.7, delay: layer.delay, ease: [0.5, 0, 0.75, 0] }}
          style={{ position: 'absolute', inset: '-20%', zIndex: 21, pointerEvents: 'none' }}
        >
          <>
          <Cloud seed={layer.seed} color={look.layers[n]} puffs={10} style={{ left: 0, top: '0%', width: '60%', height: '60%' }} />
          <Cloud seed={layer.seed + 10} color={look.layers[n]} puffs={10} style={{ left: '40%', top: '10%', width: '60%', height: '60%' }} />
          <Cloud seed={layer.seed + 20} color={look.layers[n]} puffs={10} style={{ left: '0%', top: '45%', width: '60%', height: '60%' }} />
          <Cloud seed={layer.seed + 30} color={look.layers[n]} puffs={10} style={{ left: '40%', top: '50%', width: '60%', height: '60%' }} />
          </>
        </motion.div>
      ))}
    </>
  )
}

// Coming back from a mode: start covered in that mode's colour and lift it,
// so the way back mirrors the way in.
function ReturnVeil({ from }: { from: Mode }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{ position: 'absolute', inset: 0, background: MODE_BG[from], pointerEvents: 'none', zIndex: 50 }}
    />
  )
}
