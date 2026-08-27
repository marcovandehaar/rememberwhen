import { useEffect } from 'react'

// Deliberately ugly and obviously not part of the design being judged.

export type VariantKey = 'A' | 'B' | 'C'

export function PrototypeSwitcher({
  variants, current, names, onChange,
}: {
  variants: VariantKey[]
  current: VariantKey
  names: Record<VariantKey, string>
  onChange: (v: VariantKey) => void
}) {
  const idx = variants.indexOf(current)
  const go = (delta: number) =>
    onChange(variants[(idx + delta + variants.length) % variants.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const btn: React.CSSProperties = {
    border: 0, background: 'transparent', color: '#111', fontSize: 18,
    padding: '0 14px', cursor: 'pointer', lineHeight: 1, touchAction: 'manipulation',
  }

  return (
    <div
      style={{
        position: 'fixed', zIndex: 30, left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        display: 'flex', alignItems: 'center', height: 44,
        background: '#fff', borderRadius: 999, boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
        font: '600 13px/1 -apple-system, system-ui, sans-serif', color: '#111',
        WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      <button style={btn} onClick={() => go(-1)} aria-label="vorige variant">‹</button>
      <span style={{ minWidth: 170, textAlign: 'center' }}>
        {current} — {names[current]}
      </span>
      <button style={btn} onClick={() => go(1)} aria-label="volgende variant">›</button>
    </div>
  )
}
