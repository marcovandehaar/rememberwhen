import type { StoryRect } from '../catalog/types'

// storyRect is normalised (0..1) within the *source* image (Indexer:
// indexer/Catalog/StoryRectFormula.cs), computed there against the one known
// device's fixed 4:3 viewport (10.2" iPad landscape, #25) — not within what's
// actually visible once the browser applies `object-fit: cover` to whatever
// aspect ratio the container actually has right now. So the "visible frame
// after cover-fit" has to be computed against the container's *real*
// rendered aspect, not a hardcoded 4:3 — otherwise this drifts on any window
// that isn't exactly 4:3 (which, mid-development on a laptop, is most of them).
type Rect = { x: number; y: number; width: number; height: number }

function safeCrop(naturalWidth: number, naturalHeight: number, containerAspect: number): Rect {
  const sourceAspect = naturalWidth / naturalHeight

  if (sourceAspect > containerAspect) {
    const width = containerAspect / sourceAspect
    return { x: (1 - width) / 2, y: 0, width, height: 1 }
  }

  const height = sourceAspect / containerAspect
  return { x: 0, y: (1 - height) / 2, width: 1, height }
}

/**
 * The CSS transform for an object-fit: cover element, zooming from the full
 * visible (cover-fitted) frame at p=0 toward storyRect at p=1.
 */
export function kenBurnsTransform(
  storyRect: StoryRect,
  naturalWidth: number,
  naturalHeight: number,
  containerAspect: number,
  p: number,
): string {
  if (!naturalWidth || !naturalHeight || !containerAspect) return 'scale(1) translate(0%, 0%)'

  const crop = safeCrop(naturalWidth, naturalHeight, containerAspect)

  // storyRect re-expressed as a fraction of the visible frame.
  const rx = (storyRect.x - crop.x) / crop.width
  const ry = (storyRect.y - crop.y) / crop.height
  const rw = storyRect.width / crop.width
  const rh = storyRect.height / crop.height

  // Never zoom OUT past the base frame: a storyRect that (after remapping)
  // doesn't fit inside the visible crop — a mismatch between the Indexer's
  // assumed device aspect and this container's real one — is clamped rather
  // than allowed to expose black at the edges.
  const targetScale = Math.max(1, 1 / Math.min(rw, rh))
  const targetCx = clamp01(rx + rw / 2)
  const targetCy = clamp01(ry + rh / 2)

  const scale = 1 + (targetScale - 1) * p
  const cx = 0.5 + (targetCx - 0.5) * p
  const cy = 0.5 + (targetCy - 0.5) * p

  // Zoom around the viewport center: translate the target point to center
  // first (in unscaled units), then scale the whole thing.
  const tx = (0.5 - cx) * 100
  const ty = (0.5 - cy) * 100
  return `scale(${scale}) translate(${tx}%, ${ty}%)`
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Cross-dissolve envelope: hold in the middle, fade at the edges. */
export function opacityAt(p: number, first: boolean, last: boolean): number {
  const IN = 0.14
  const OUT = 0.86
  if (p < IN) return first ? 1 : p / IN
  if (p > OUT) return last ? 1 : (1 - p) / (1 - OUT)
  return 1
}
