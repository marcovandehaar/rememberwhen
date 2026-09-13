import { useEffect, useRef } from 'react'
import type { MediaItem } from '../catalog/types'

/**
 * Tap an item, see it whole. Photos stop being cropped to full-bleed and get
 * their real aspect back; video gets sound, which on iPadOS only one element
 * may have at a time — fine, because only one is ever open (#12).
 */
export function Lightbox({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    // `overflow: hidden` alone leaves the body's scroll offset in place, and
    // iOS Safari sometimes repaints this fixed overlay at that stale offset
    // instead of the viewport origin — it shows up small and shifted, as if
    // still scrolled into the Story behind it. Pinning the body itself with
    // `position: fixed` at its current offset (then restoring scroll on
    // close) is the standard iOS fix and avoids the glitch outright.
    const scrollY = window.scrollY
    const { body } = document
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    video.current?.play().catch(() => {})
    return () => {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
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
