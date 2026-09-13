import { useEffect, useState } from 'react'

/** The Story's own full-bleed container is width/height of the viewport. */
export function useContainerAspect(): number {
  const [aspect, setAspect] = useState(() => window.innerWidth / window.innerHeight)

  useEffect(() => {
    const onResize = () => setAspect(window.innerWidth / window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return aspect
}
