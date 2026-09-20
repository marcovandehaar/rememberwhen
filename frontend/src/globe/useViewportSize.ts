import { useEffect, useState } from 'react'

// GlobeGL only measures window.innerWidth/innerHeight once, at mount — it
// has no resize listener of its own (three-render-objects just uses them as
// static defaults). Without this, rotating a phone to landscape leaves the
// canvas sized to the portrait viewport it was born in.
export function useViewportSize() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return size
}
