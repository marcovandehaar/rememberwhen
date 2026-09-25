import { useRef, useState } from 'react'
import { scrollProgress, setScrollProgress } from './scrollProgress'

// Quick, not leisurely — same register as PinChooser.tsx's bottom sheet
// (ui-polish-taste: ~160ms, ease-out). Kept as its own constant rather than
// importing PinChooser's: these are two unrelated features that happen to
// agree on a timing, not one depending on the other.
const TRANSITION_MS = 160
// 80% of the viewport, not edge-to-edge — leaves the track's own ends clear
// of the thumb's usual resting fingers.
const TRACK_WIDTH = '80vw'
const HIT_AREA_HEIGHT = 44 // Apple HIG's minimum comfortable touch target
const BUTTON_SIZE = 34 // matches PinChooser.tsx's NavArrow buttons
const THUMB_SIZE = 28 // sized to land a fingertip on an iPad, not a mouse-precision target

/**
 * The toggleable fast-scroll control (#50): a small always-visible button
 * that, tapped, opens a horizontal track — growing outward from the centre,
 * mirroring how it'll one day close — with a thumb at the Story's current
 * scroll position and a tick per Chapter boundary. Dragging the thumb drives
 * the Story's own scroll position directly (setScrollProgress), so what's
 * on screen updates live exactly as it would from a finger-scroll.
 */
export function ScrubBar({
  open,
  onOpenChange,
  chapterTicks,
  onDraggingChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Fractional (0..1) positions of each Chapter's opening entry. */
  chapterTicks: number[]
  /** Story.tsx gates its close-on-scroll listener on this — the drag itself scrolls the page, and that must not count. */
  onDraggingChange: (dragging: boolean) => void
}) {
  const [progress, setProgress] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)

  // Seed the thumb at wherever the Story actually is each time this opens —
  // not reset to 0, and not left stale from the last time it was open.
  // Adjusted during render rather than in an effect, so there's no one-frame
  // flash of the stale position before an effect would otherwise fire.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setProgress(scrollProgress())
  }

  const updateFromPointer = (clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const fraction = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
    const clamped = Math.min(1, Math.max(0, fraction))
    setProgress(clamped)
    setScrollProgress(clamped)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    onDraggingChange(true)
    updateFromPointer(e.clientX)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons !== 1) return // hover, not an active touch/mouse-button drag
    updateFromPointer(e.clientX)
  }

  const onPointerUp = () => {
    // Two rAFs: gives any 'scroll' event still in flight from the drag's
    // last setScrollProgress a chance to arrive and be ignored (Story.tsx's
    // close-on-scroll listener checks this flag) before a *real* user
    // scroll is allowed to close the bar.
    requestAnimationFrame(() => requestAnimationFrame(() => onDraggingChange(false)))
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        transform: 'translateX(-50%)',
        zIndex: 25,
        width: TRACK_WIDTH,
        height: HIT_AREA_HEIGHT,
      }}
    >
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          opacity: open ? 1 : 0,
          transform: `scaleX(${open ? 1 : 0})`,
          transformOrigin: 'center',
          transition: `opacity ${TRANSITION_MS}ms ease-out, transform ${TRANSITION_MS}ms ease-out`,
          pointerEvents: open ? 'auto' : 'none',
          // This control owns horizontal drags; don't let the browser read
          // one as a page-scroll or pinch-zoom gesture underneath it.
          touchAction: 'none',
        }}
      >
        <div style={{ position: 'relative', width: '100%', height: 2, borderRadius: 1, background: 'rgba(255,255,255,.35)' }}>
          {chapterTicks.map((t, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${t * 100}%`,
                top: -3,
                width: 2,
                height: 8,
                borderRadius: 1,
                background: 'rgba(255,255,255,.35)',
                transform: 'translateX(-1px)',
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              left: `${progress * 100}%`,
              top: '50%',
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: '50%',
              background: 'rgba(10,13,20,.4)',
              border: '2.5px solid #fff',
              boxSizing: 'border-box',
              // Globe.tsx's pin ring/glow colour (also PinChooser.tsx's
              // PIN_GLOW) — an existing accent, not a new one (ui-polish-taste).
              boxShadow: '0 0 12px rgba(120,180,255,.5)',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={open ? 'Snel scrollen sluiten' : 'Snel scrollen'}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(0,0,0,.5)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          opacity: open ? 0 : 1,
          // Sits exactly where the thumb lands at progress ~0.5 (both are
          // centred on the track) — while open, it must not swallow a drag
          // that starts near the middle by staying the topmost hit target.
          pointerEvents: open ? 'none' : 'auto',
          transition: `opacity ${TRANSITION_MS}ms ease-out`,
        }}
      >
        <ScrubIcon />
      </button>
    </div>
  )
}

function ScrubIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <line x1="2" y1="12" x2="7" y2="12" />
      <line x1="17" y1="12" x2="22" y2="12" />
      <polyline points="5 9 2 12 5 15" />
      <polyline points="19 9 22 12 19 15" />
    </svg>
  )
}
