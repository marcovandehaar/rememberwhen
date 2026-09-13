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

export function Lightbox({ item, onClose }: { item: MediaItem; onClose: () => void }) {
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
      styles={{
        root: { '--yarl__color_backdrop': 'rgba(0,0,0,.94)' },
      }}
    />
  )
}
