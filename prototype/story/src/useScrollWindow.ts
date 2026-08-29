import { useEffect, useState } from 'react'

/**
 * Keep only a window of items mounted around the scroll position.
 *
 * This is the one piece of JavaScript that is genuinely required. The
 * animation itself is pure CSS on a scroll timeline — no JS in the frame loop —
 * but every item is a full-bleed fixed layer, and 42 decoded 1920px photos is
 * roughly half a gigabyte of bitmap. iPadOS kills the tab long before that.
 *
 * The story research called this out: preload and eviction stays required work
 * whatever the renderer. This is the cheapest honest version of it.
 */
export function useScrollWindow(count: number, radius = 3) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? window.scrollY / max : 0
      setIndex(Math.round(p * (count - 1)))
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
