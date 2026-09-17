import { useState } from 'react'
import ReactLightbox from 'yet-another-react-lightbox'
import Video from 'yet-another-react-lightbox/plugins/video'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'yet-another-react-lightbox/styles.css'
import type { MediaItem } from '../catalog/types'

// Two homegrown attempts at pinch-zoom-pan-to-fullscreen on iOS Safari both
// failed in different ways (mispositioned overlay, then zoom that wouldn't
// engage and snapped back) — the same lesson as ADR 0002's globe: this is a
// solved problem on hardware we don't have, so stop re-solving it ourselves.
// yet-another-react-lightbox + its Zoom plugin owns the gesture physics
// (pinch, double-tap, pan, offset clamping, its own scroll-lock) — react-
// native, MIT, ~12 KB gzip core, actively maintained.
function videoMimeType(mediaRef: string): string {
  const ext = mediaRef.split('.').pop()?.toLowerCase()
  return ext === 'mov' ? 'video/quicktime' : 'video/mp4'
}

export function Lightbox({ item, startAt, onClose }: { item: MediaItem; startAt?: number; onClose: () => void }) {
  // The library already defers calling `onClose` until its own fade-out
  // finishes (see its Portal: `setVisible(false)` → wait `animation.fade` →
  // `close()`), so this component stays mounted for the whole exit
  // animation — no extra open/close state of our own needed for that part.
  // `settled` adds a touch beyond the bare fade: the slide itself scales in
  // from .96 rather than snapping straight to size, tracking the same
  // entering/exiting timeline the library already exposes.
  const [settled, setSettled] = useState(false)

  const slide =
    item.type === 'video'
      ? {
          type: 'video' as const,
          sources: [{ src: item.mediaRef, type: videoMimeType(item.mediaRef) }],
          autoPlay: true,
          muted: false,
          controls: true,
          playsInline: true,
        }
      : { src: item.mediaRef }

  return (
    <ReactLightbox
      open
      close={onClose}
      slides={[slide]}
      plugins={item.type === 'video' ? [Video] : [Zoom]}
      carousel={{ finite: true }}
      render={{ buttonPrev: () => null, buttonNext: () => null }}
      controller={{ closeOnBackdropClick: true }}
      labels={{ Close: 'Sluiten', 'Zoom in': 'Inzoomen', 'Zoom out': 'Uitzoomen' }}
      on={{
        // A same-tick setSettled(true) never paints the pre-scaled state at
        // all — React batches both styles into one frame, so there's
        // nothing for the CSS transition to animate from. Two rAFs guarantee
        // a real paint of scale(.96) happens first.
        entering: () => {
          requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)))
          // #35: the Story's muted preview is already mid-playback when
          // tapped — seek the Lightbox's own <video> to match, so sound
          // "continues" instead of visibly restarting from the beginning.
          // There's only ever one slide, so no need to pick "the current" one.
          if (startAt) {
            // The slide's own <video> isn't in the DOM yet on the tick
            // `entering` fires (the library mounts it a beat later) — poll
            // a few animation frames rather than querying immediately.
            let tries = 0
            const trySeek = () => {
              const video = document.querySelector<HTMLVideoElement>('.yarl__slide video')
              if (video) video.currentTime = startAt
              else if (tries++ < 10) requestAnimationFrame(trySeek)
            }
            requestAnimationFrame(trySeek)
          }
        },
        exiting: () => setSettled(false),
      }}
      styles={{
        root: { '--yarl__color_backdrop': 'rgba(0,0,0,.94)' },
        slide: {
          transform: `scale(${settled ? 1 : 0.96})`,
          transition: 'transform .32s cubic-bezier(.22,1,.36,1)',
        },
      }}
    />
  )
}
