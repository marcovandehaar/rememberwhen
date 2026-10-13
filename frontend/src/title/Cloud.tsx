import { useMemo, type CSSProperties } from 'react'

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A cloud is a cluster of soft radial-gradient puffs: the softness is baked
// into the gradient, so moving it is a pure compositor transform — never an
// animated blur.
export function Cloud({ seed, color = '255,255,255', alpha = 0.92, puffs = 9, style }: {
  seed: number
  color?: string
  alpha?: number
  puffs?: number
  style: CSSProperties
}) {
  const shapes = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: puffs }, () => {
      const s = 0.3 + r() * 0.4
      return { x: r() * (1 - s), y: 0.35 + r() * 0.3, s }
    })
  }, [seed, puffs])

  return (
    <div style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
      {shapes.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x * 100}%`,
            top: `${p.y * 100}%`,
            width: `${p.s * 100}%`,
            aspectRatio: '1.6',
            transform: 'translateY(-50%)',
            borderRadius: '50%',
            background: `radial-gradient(closest-side, rgba(${color},${alpha}) 0%, rgba(${color},${alpha * 0.55}) 50%, rgba(${color},0) 100%)`,
          }}
        />
      ))}
    </div>
  )
}
