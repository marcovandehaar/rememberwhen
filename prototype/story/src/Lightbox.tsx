import { useEffect, useRef } from 'react'
import type { Beat } from './story'

/**
 * Tap an item, see it whole. Photos stop being cropped to full-bleed and get
 * their real aspect back; video gets sound, which on iPadOS only one element
 * may have at a time — fine, because only one is ever open.
 */
export function Lightbox({ beat, onClose }: { beat: Beat; onClose: () => void }) {
  const video = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    video.current?.play().catch(() => {})
    return () => {
      document.body.style.overflow = ''
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
        // The platform's own match cut, where it exists.
        viewTransitionName: 'opened',
      }}
    >
      {beat.item.kind === 'video' ? (
        <video
          ref={video}
          src={beat.item.src}
          controls
          playsInline
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={beat.item.src}
          alt=""
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
        />
      )}

      <div
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
          right: 16,
          color: 'rgba(255,255,255,.8)',
          font: '500 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        {beat.item.taken} · tik om te sluiten
      </div>
    </div>
  )
}
