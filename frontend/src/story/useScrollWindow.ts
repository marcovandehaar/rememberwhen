import { useEffect, useState } from 'react'
import { opacityAt } from './kenBurns'
import type { PlanEntry } from './plan'
import { scrollProgress } from './scrollProgress'

/**
 * Which beat is "current" — for the tap target and for which items stay
 * mounted — has to agree with which beat is actually most visible, not a
 * linear guess. A beat's own [start, end) window is wider than its even
 * spacing (`plan.ts`'s overlap ratio, so consecutive shots can cross-fade),
 * so the naive `round(progress * (count - 1))` flips to the next beat long
 * before the current one finishes its own fade-out — a tap right after
 * that flips-but-still-showing point would open the next Media Item, not
 * the one still on screen. Picking by max `opacityAt` instead makes the tap
 * target match what's actually most opaque right now.
 */
export function activeIndex(plan: PlanEntry[], progress: number): number {
  let best = plan[0]?.b.i ?? 0
  let bestOpacity = -1
  for (const { b, start, end, first, last } of plan) {
    if (progress < start || progress > end) continue
    const span = end - start
    const p = span > 0 ? (progress - start) / span : 1
    const opacity = opacityAt(p, first, last)
    if (opacity > bestOpacity) {
      bestOpacity = opacity
      best = b.i
    }
  }
  return best
}

/**
 * Keep only a window of items mounted around the current beat.
 *
 * The animation itself is pure CSS on a scroll timeline (or hand-interpolated
 * where the platform lacks one) — no JS in the frame loop for the animation —
 * but every item is a full-bleed fixed layer, and dozens of decoded photos
 * add up fast. iPadOS kills the tab long before that (proven in #6).
 */
export function useScrollWindow(plan: PlanEntry[], radius = 3) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      setIndex(activeIndex(plan, scrollProgress()))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [plan])

  return {
    index,
    isMounted: (i: number) => Math.abs(i - index) <= radius,
  }
}
