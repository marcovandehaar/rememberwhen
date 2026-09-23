// PROTOTYPE — throwaway code for issue "animate the Story opening title".
// Three radically different animation + font pairings for ChapterCard's
// title (Story.tsx). Dev-only: Story.tsx swaps this in for ChapterCard
// behind `import.meta.env.DEV`, so none of this ships to production.
// See .claude/skills/prototype/UI.md for the pattern this follows.
import { useEffect, useRef, useState } from 'react'
import { motion, type Variants } from 'framer-motion'
import type { Memory } from '../catalog/types'

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300..700&family=Fredoka:wght@400..700&family=Space+Grotesk:wght@400..700&family=JetBrains+Mono:wght@400;600&display=swap'

function useGoogleFonts() {
  useEffect(() => {
    if (document.querySelector(`link[href="${FONTS_HREF}"]`)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONTS_HREF
    document.head.appendChild(link)
  }, [])
}

// Drives an in -> hold -> out -> gap loop so Marco can watch it repeat
// without re-entering the Story each time. `nonce` restarts the loop (Replay).
function useLoop(nonce: number) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let alive = true
    let timer = 0
    const step = (visible: boolean, delay: number) => {
      timer = window.setTimeout(() => {
        if (!alive) return
        setShow(visible)
        if (visible) step(false, 2600) // hold, then exit
        else step(true, 1100) // gap, then re-enter
      }, delay)
    }
    setShow(false)
    step(true, 250) // brief pause on mount, then play the entrance
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [nonce])
  return show
}

const SCRIM: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.15) 45%, rgba(0,0,0,.55))',
  textAlign: 'center',
  color: '#fff',
  pointerEvents: 'none',
}

// ---------------------------------------------------------------------------
// Variant A — Fraunces, word-by-word rise+blur, textillate-style but at word
// granularity (a title is usually 2-4 words; per-letter reads busier here).
// ---------------------------------------------------------------------------
function VariantA({ memory, nonce }: { memory: Memory; nonce: number }) {
  const show = useLoop(nonce)
  const words = memory.name.split(' ')

  const container: Variants = {
    hidden: { transition: { staggerChildren: 0.07, staggerDirection: -1 } },
    visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
  }
  const word: Variants = {
    hidden: { opacity: 0, y: 16, filter: 'blur(6px)', transition: { duration: 0.35, ease: 'easeIn' } },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
  }
  const label: Variants = {
    hidden: { opacity: 0, y: -8, transition: { duration: 0.3 } },
    visible: { opacity: 0.8, y: 0, transition: { duration: 0.5 } },
  }

  return (
    <div style={SCRIM}>
      <div>
        <motion.div
          initial="hidden"
          animate={show ? 'visible' : 'hidden'}
          variants={label}
          style={{ font: '500 13px/1 "JetBrains Mono", monospace', letterSpacing: '.22em', textTransform: 'uppercase' }}
        >
          {memory.destinationName}
        </motion.div>
        <motion.div
          initial="hidden"
          animate={show ? 'visible' : 'hidden'}
          variants={container}
          style={{
            marginTop: 14,
            fontFamily: '"Fraunces", serif',
            fontOpticalSizing: 'auto',
            fontWeight: 560,
            fontSize: 44,
            lineHeight: 1.15,
            textShadow: '0 2px 30px rgba(0,0,0,.6)',
          }}
        >
          {words.map((w, i) => (
            <span key={i} style={{ display: 'inline-block' }}>
              <motion.span variants={word} style={{ display: 'inline-block' }}>
                {w}
              </motion.span>
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variant B — Fredoka, letter-by-letter spring cascade with a little wobble.
// The closest match to textillate's classic bounceIn/bounceOut letter effect.
// ---------------------------------------------------------------------------
function VariantB({ memory, nonce }: { memory: Memory; nonce: number }) {
  const show = useLoop(nonce)
  const letters = memory.name.split('')
  // Stable per-letter wobble, precomputed once so it doesn't reshuffle on rerender.
  const wobble = useRef(letters.map(() => (Math.random() * 14 - 7).toFixed(1))).current

  const container: Variants = {
    hidden: { transition: { staggerChildren: 0.018, staggerDirection: -1 } },
    visible: { transition: { staggerChildren: 0.035, delayChildren: 0.1 } },
  }
  const letter = (rotate: string): Variants => ({
    hidden: { opacity: 0, y: -26, rotate: `${-Number(rotate)}deg`, scale: 0.7, transition: { duration: 0.3, ease: 'easeIn' } },
    visible: { opacity: 1, y: 0, rotate: '0deg', scale: 1, transition: { type: 'spring', stiffness: 420, damping: 15 } },
  })
  const badge: Variants = {
    hidden: { opacity: 0, scale: 0.7, transition: { duration: 0.25 } },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 14, delay: 0.05 } },
  }

  return (
    <div style={SCRIM}>
      <div>
        <motion.div
          initial="hidden"
          animate={show ? 'visible' : 'hidden'}
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
          animate={show ? 'visible' : 'hidden'}
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

// ---------------------------------------------------------------------------
// Variant C — Space Grotesk, whole-block blur+scale reveal with a drawn rule.
// No letter/word splitting at all: the structural counterpoint to A and B.
// ---------------------------------------------------------------------------
function VariantC({ memory, nonce }: { memory: Memory; nonce: number }) {
  const show = useLoop(nonce)

  const label: Variants = {
    hidden: { opacity: 0, transition: { duration: 0.25 } },
    visible: { opacity: 0.75, transition: { duration: 0.4 } },
  }
  const title: Variants = {
    hidden: { opacity: 0, scale: 0.94, filter: 'blur(14px)', transition: { duration: 0.45, ease: 'easeIn' } },
    visible: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 } },
  }
  const rule: Variants = {
    hidden: { scaleX: 0, opacity: 0, transition: { duration: 0.2 } },
    visible: { scaleX: 1, opacity: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.55 } },
  }

  return (
    <div style={SCRIM}>
      <div>
        <motion.div
          initial="hidden"
          animate={show ? 'visible' : 'hidden'}
          variants={label}
          style={{ font: '600 13px/1 "JetBrains Mono", monospace', letterSpacing: '.22em', textTransform: 'uppercase' }}
        >
          {memory.destinationName}
        </motion.div>
        <motion.div
          initial="hidden"
          animate={show ? 'visible' : 'hidden'}
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
          animate={show ? 'visible' : 'hidden'}
          variants={rule}
          style={{ height: 2, width: 64, background: 'rgba(255,255,255,.6)', margin: '16px auto 0', transformOrigin: 'center' }}
        />
      </div>
    </div>
  )
}

const VARIANTS = {
  A: { Component: VariantA, name: 'Fraunces — word rise' },
  B: { Component: VariantB, name: 'Fredoka — letter cascade' },
  C: { Component: VariantC, name: 'Space Grotesk — blur reveal' },
} as const
type VariantKey = keyof typeof VARIANTS
const KEYS = Object.keys(VARIANTS) as VariantKey[]

function readVariant(): VariantKey {
  const v = new URLSearchParams(window.location.search).get('titleVariant')
  return v && (KEYS as string[]).includes(v) ? (v as VariantKey) : 'A'
}

export function StoryTitlePrototype({ memory }: { memory: Memory }) {
  useGoogleFonts()
  const [variant, setVariant] = useState<VariantKey>(readVariant)
  const [nonce, setNonce] = useState(0)

  const setAndPersist = (v: VariantKey) => {
    setVariant(v)
    const url = new URL(window.location.href)
    url.searchParams.set('titleVariant', v)
    window.history.replaceState(null, '', url)
  }

  const cycle = (dir: 1 | -1) => {
    const i = KEYS.indexOf(variant)
    setAndPersist(KEYS[(i + dir + KEYS.length) % KEYS.length])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return
      if (e.key === 'ArrowLeft') cycle(-1)
      if (e.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant])

  const { Component } = VARIANTS[variant]

  return (
    <>
      <Component memory={memory} nonce={nonce} />
      <div
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
          transform: 'translateX(-50%)',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 10px',
          borderRadius: 999,
          background: 'rgba(20,20,20,.85)',
          boxShadow: '0 8px 24px rgba(0,0,0,.4)',
          font: '600 13px/1 -apple-system, system-ui, sans-serif',
          color: '#fff',
        }}
      >
        <button type="button" onClick={() => cycle(-1)} style={pillBtn} aria-label="Vorige variant">
          ←
        </button>
        <span style={{ minWidth: 170, textAlign: 'center' }}>
          {variant} — {VARIANTS[variant].name}
        </span>
        <button type="button" onClick={() => cycle(1)} style={pillBtn} aria-label="Volgende variant">
          →
        </button>
        <button type="button" onClick={() => setNonce((n) => n + 1)} style={{ ...pillBtn, width: 'auto', padding: '0 10px' }}>
          ↻ Replay
        </button>
      </div>
    </>
  )
}

const pillBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: 'none',
  background: 'rgba(255,255,255,.15)',
  color: '#fff',
  cursor: 'pointer',
  font: 'inherit',
}
