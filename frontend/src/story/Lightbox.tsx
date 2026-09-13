import { useEffect, useLayoutEffect, useRef } from 'react'
import type { MediaItem } from '../catalog/types'

/**
 * Tap an item, see it whole. Photos stop being cropped to full-bleed and get
 * their real aspect back; video gets sound, which on iPadOS only one element
 * may have at a time — fine, because only one is ever open (#12).
 */
export function Lightbox({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const root = useRef<HTMLDivElement | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    video.current?.play().catch(() => {})
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // The Story behind this is a tall scroll-driven page faked into looking
  // stationary (its content is itself `position: fixed`, moved only via
  // transforms read off scroll position) — exactly the setup where iOS
  // Safari's `position: fixed` is known to lose track of the real visible
  // area (it shows up small and shifted, as if still anchored to wherever
  // the page was scrolled/zoomed). `window.visualViewport` is the browser's
  // own live "what's actually on screen right now" rect — sizing off that
  // instead of trusting `inset: 0` sidesteps the bug rather than guessing
  // at its cause.
  useLayoutEffect(() => {
    const vv = window.visualViewport
    const el = root.current
    if (!vv || !el) return
    const sync = () => {
      el.style.width = `${vv.width}px`
      el.style.height = `${vv.height}px`
      el.style.transform = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px)`
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  return (
    <div
      ref={root}
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        // Fallback for the instant before the layout effect measures the
        // real visual viewport (and for the (untested-on-device) case where
        // it's unavailable at all) — overwritten by `sync` immediately after.
        width: '100vw',
        height: '100dvh',
        zIndex: 40,
        background: 'rgba(0,0,0,.94)',
        backdropFilter: 'blur(20px)',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {item.type === 'video' ? (
        <video
          ref={video}
          src={item.mediaRef}
          controls
          playsInline
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={item.mediaRef}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      )}

      <div
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px 6px 8px',
          borderRadius: 999,
          background: 'rgba(0,0,0,.5)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          font: '600 13px/1 -apple-system, system-ui, sans-serif',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'rgba(255,255,255,.18)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            lineHeight: 1,
          }}
        >
          ✕
        </span>
        sluiten
      </div>

      {item.type === 'photo' && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(0,0,0,.5)',
            backdropFilter: 'blur(8px)',
            color: 'rgba(255,255,255,.8)',
            font: '500 12px/1 -apple-system, system-ui, sans-serif',
          }}
        >
          <PinchIcon />
          knijp om in te zoomen
        </div>
      )}
    </div>
  )
}

function PinchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4l5 5M4 4v4M4 4h4" />
      <path d="M20 20l-5-5M20 20v-4M20 20h-4" />
    </svg>
  )
}
