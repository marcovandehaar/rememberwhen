import type { ReactNode } from 'react'
import { SF } from '../title/modes'

/** The embossed label-maker strip the year sits on. */
export function Dymo({ children, hint = false }: { children: ReactNode; hint?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '9px 16px 9px 20px',
        background: 'linear-gradient(180deg, #2b2f38, #1a1d24)',
        borderRadius: 4,
        boxShadow: '0 3px 8px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.08)',
        color: '#f4f1ea',
        font: `700 22px/1 ${SF}`,
        letterSpacing: '.32em',
        textShadow: '0 1px 0 rgba(255,255,255,.18), 0 -1px 0 rgba(0,0,0,.7)',
        transform: 'rotate(-1.2deg)',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {children}
      {hint && (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#f4f1ea" strokeWidth="1.6" opacity=".7" aria-hidden>
          <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
          <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
          <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
        </svg>
      )}
    </span>
  )
}
