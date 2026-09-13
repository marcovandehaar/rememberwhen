import { useEffect, useState } from 'react'
import { scrollProgress } from './scrollProgress'

/**
 * Keep only a window of items mounted around the scroll position.
 *
 * The animation itself is pure CSS on a scroll timeline (or hand-interpolated
 * where the platform lacks one) — no JS in the frame loop for the animation —
 * but every item is a full-bleed fixed layer, and dozens of decoded photos
 * add up fast. iPadOS kills the tab long before that (proven in #6).
 */
export function useScrollWindow(count: number, radius = 3) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      setIndex(Math.round(scrollProgress() * (count - 1)))
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
  }, [count])

  return {
    index,
    isMounted: (i: number) => Math.abs(i - index) <= radius,
  }
}
