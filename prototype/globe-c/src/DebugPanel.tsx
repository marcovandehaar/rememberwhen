import { useState } from 'react'
import type { Settings } from './settings'

const ROWS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'bloom', label: 'bloom', hint: 'kost ~2/3 van de fps' },
  { key: 'msaa', label: 'msaa x4', hint: 'samples op composer' },
  { key: 'fullDpr', label: 'dpr 2', hint: 'uit = dpr 1' },
  { key: 'autoRotate', label: 'draaien', hint: 'aan = stotter zichtbaar' },
]

export function DebugPanel({
  settings, onChange,
}: { settings: Settings; onChange: (s: Settings) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        position: 'fixed', zIndex: 25, right: 0, top: 'env(safe-area-inset-top, 0px)',
        margin: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
        WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="instellingen"
        style={{
          width: 38, height: 38, borderRadius: 999, border: 0, padding: 0,
          background: open ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.55)',
          color: open ? '#111' : '#e5e7eb', backdropFilter: 'blur(8px)',
          fontSize: 18, lineHeight: 1, cursor: 'pointer', touchAction: 'manipulation',
          boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        }}
      >
        ⚙
      </button>

      {open && (
        <div
          style={{
            padding: '8px 10px', borderRadius: 8,
            background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(10px)', color: '#e5e7eb',
            font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {ROWS.map(({ key, label, hint }) => (
            <div
              key={key}
              onClick={() => onChange({ ...settings, [key]: !settings[key] })}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                cursor: 'pointer', minWidth: 158,
              }}
            >
              <span
                style={{
                  width: 30, height: 17, borderRadius: 999, flexShrink: 0,
                  background: settings[key] ? '#4ade80' : '#4b5563',
                  position: 'relative', transition: 'background .15s',
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: 2, left: settings[key] ? 15 : 2,
                    width: 13, height: 13, borderRadius: 999, background: '#fff',
                    transition: 'left .15s',
                  }}
                />
              </span>
              <span>
                {label}
                <span style={{ opacity: 0.45 }}> · {hint}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
