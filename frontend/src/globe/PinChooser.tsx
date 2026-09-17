import { useEffect, useState } from 'react'
import type { Memory } from '../catalog/types'
import { latestCapturedAt, type Pin } from './pins'

// #11/#32: a thumb-friendly bottom sheet, not a menu anchored to the pin's
// screen position — the pin itself is mid-flight (the camera is still
// animating in) when this appears, so there's no stable point to anchor to.
// ~4 rows visible before scrolling, per the acceptance criterion.
const ROW_HEIGHT = 72

// Echoes the globe pin's own ring (Globe.tsx: 2px white border + blue glow),
// so a row visually rhymes with the pin the operator just tapped.
const PIN_GLOW = '0 0 12px rgba(120,180,255,.5)'
const WARM_GLOW = '0 0 12px rgba(255,180,84,.55)'

// Quick, not a leisurely spring — Marco wants the sheet to feel snappy after
// the (spec-mandated) camera fly-in, not add its own perceptible delay.
const TRANSITION_MS = 160

function yearOf(memory: Memory): string | null {
  const t = latestCapturedAt(memory)
  return Number.isFinite(t) ? String(new Date(t).getFullYear()) : null
}

export function PinChooser({ pin, onChoose, onDismiss }: { pin: Pin; onChoose: (memory: Memory) => void; onDismiss: () => void }) {
  const byNewestFirst = [...pin.memories].sort((a, b) => latestCapturedAt(b) - latestCapturedAt(a))
  const newest = byNewestFirst[0]

  // Three phases, not a boolean: 'entering' → 'open' plays the pop-in (same
  // double-rAF trick as Lightbox.tsx's `settled`, so the closed style really
  // paints first); 'open' → 'closing' plays the same transition in reverse
  // and only calls onDismiss once it's actually finished, so the sheet
  // visibly leaves instead of vanishing — the globe stays sharp throughout,
  // there's no backdrop blur to fade.
  const [phase, setPhase] = useState<'entering' | 'open' | 'closing'>('entering')
  const [pressed, setPressed] = useState<string | null>(null)
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setPhase('open')))
  }, [])

  const dismiss = () => {
    setPhase('closing')
    setTimeout(onDismiss, TRANSITION_MS)
  }
  const visible = phase === 'open'

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4,7,15,.3)',
        opacity: visible ? 1 : 0,
        transition: `opacity ${TRANSITION_MS}ms ease-out`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          maxHeight: ROW_HEIGHT * 4 + 92,
          overflowY: 'auto',
          background: 'linear-gradient(180deg, #1a1f2b, #0a0d14)',
          borderTop: '1px solid rgba(255,255,255,.08)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -20px 60px rgba(0,0,0,.55)',
          padding: '4px 4px 10px',
          transform: `translateY(${visible ? 0 : 24}px)`,
          opacity: visible ? 1 : 0,
          transition: `transform ${TRANSITION_MS}ms ease-out, opacity ${TRANSITION_MS}ms ease-out`,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -40,
            left: '50%',
            width: 220,
            height: 120,
            transform: 'translateX(-50%)',
            background: 'radial-gradient(closest-side, rgba(255,180,84,.16), transparent)',
            pointerEvents: 'none',
          }}
        />

        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.25)', margin: '10px auto 2px' }} />

        <div style={{ padding: '10px 16px 14px', textAlign: 'center', position: 'relative' }}>
          <div style={{ color: '#fff', font: '600 19px/1.25 -apple-system,system-ui,sans-serif' }}>{pin.destinationName}</div>
          <div style={{ color: 'rgba(255,255,255,.5)', font: '500 12.5px/1.4 -apple-system,system-ui,sans-serif', marginTop: 2 }}>
            {pin.memories.length} memories op dit punt
          </div>
        </div>

        {byNewestFirst.map((memory) => {
          const isPressed = pressed === memory.id
          const year = yearOf(memory)
          return (
            <button
              key={memory.id}
              onClick={() => onChoose(memory)}
              onPointerDown={() => setPressed(memory.id)}
              onPointerUp={() => setPressed(null)}
              onPointerLeave={() => setPressed(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                height: ROW_HEIGHT,
                padding: '0 16px',
                background: 'none',
                border: 'none',
                borderTop: memory === byNewestFirst[0] ? 'none' : '1px solid rgba(255,255,255,.07)',
                color: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
                transform: `scale(${isPressed ? 0.97 : 1})`,
                transition: 'transform .12s ease-out',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: 52,
                  height: 52,
                  flexShrink: 0,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '2px solid rgba(255,255,255,.85)',
                  boxShadow: memory === newest ? WARM_GLOW : PIN_GLOW,
                }}
              >
                <img src={memory.coverImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: '600 15.5px/1.3 -apple-system,system-ui,sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {memory.name}
                </div>
                {year && (
                  <div style={{ font: '500 12.5px/1.3 -apple-system,system-ui,sans-serif', color: 'rgba(255,255,255,.5)', marginTop: 1 }}>{year}</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
