import type { Settings } from './settings'

const ROWS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'bloom', label: 'bloom', hint: 'de post-pass' },
  { key: 'msaa', label: 'msaa x4', hint: 'samples op composer' },
  { key: 'fullDpr', label: 'dpr 2', hint: 'uit = dpr 1' },
  { key: 'autoRotate', label: 'draaien', hint: 'aan = stotter zichtbaar' },
]

export function DebugPanel({
  settings, onChange,
}: { settings: Settings; onChange: (s: Settings) => void }) {
  return (
    <div
      style={{
        position: 'fixed', zIndex: 20, right: 0, top: 'env(safe-area-inset-top, 0px)',
        margin: 8, padding: '8px 10px', borderRadius: 8,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)', color: '#e5e7eb',
        font: '11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
        WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      {ROWS.map(({ key, label, hint }) => (
        <div
          key={key}
          onClick={() => onChange({ ...settings, [key]: !settings[key] })}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
            cursor: 'pointer', minWidth: 150,
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
  )
}
