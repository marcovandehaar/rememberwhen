// PROTOTYPE — throwaway (#75). Floating bar to flip between the looks.
import { useEffect, useState } from 'react'
import { ORIGINAL, THEMES, type Theme } from './themes'

const KEYS = [ORIGINAL, ...THEMES.map((t) => t.key)]

export function useThemeVariant(): [Theme | null, (key: string) => void, string] {
  const [key, setKey] = useState(() => new URLSearchParams(window.location.search).get('titleVariant') ?? 'A')
  const set = (next: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('titleVariant', next)
    window.history.replaceState(null, '', url)
    setKey(next)
  }
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return
      const i = KEYS.indexOf(key)
      set(KEYS[(i + (ev.key === 'ArrowRight' ? 1 : KEYS.length - 1)) % KEYS.length])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return [THEMES.find((t) => t.key === key) ?? null, set, key]
}

export function Switcher({ current, onPick }: { current: string; onPick: (key: string) => void }) {
  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 300, display: 'flex', gap: 6, padding: 6, borderRadius: 999, background: 'rgba(0,0,0,.72)', font: '600 13px/1 system-ui', color: '#fff' }}>
      {KEYS.map((k) => (
        <button
          key={k}
          onClick={() => onPick(k)}
          style={{ all: 'unset', cursor: 'pointer', padding: '9px 14px', borderRadius: 999, background: k === current ? '#fff' : 'transparent', color: k === current ? '#000' : '#fff' }}
        >
          {k === ORIGINAL ? 'Huidig' : `${k} ${THEMES.find((t) => t.key === k)!.name}`}
        </button>
      ))}
    </div>
  )
}
