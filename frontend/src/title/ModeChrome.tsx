import { motion } from 'framer-motion'
import { MODE_BG, type Mode } from './modes'
import { Press } from './Press'

// Same control in both modes: a small sun-over-the-horizon mark, the title
// screen's own motif, in the corner where a back button is expected.
export function BackToTitle({ onBack, light = false }: { onBack: () => void; light?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, delay: 0.35, ease: 'easeOut' }}
      style={{ position: 'fixed', top: 'calc(16px + env(safe-area-inset-top))', left: 16, zIndex: 60 }}
    >
      <Press onTap={onBack} label="Terug naar het beginscherm">
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: light ? 'rgba(42,32,24,.08)' : 'rgba(4,7,15,.55)',
            border: `1px solid ${light ? 'rgba(42,32,24,.25)' : 'rgba(255,255,255,.35)'}`,
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={light ? '#2a2018' : '#fff'} strokeWidth="1.8" strokeLinecap="round">
            <path d="M6.5 15a5.5 5.5 0 0 1 11 0" />
            <path d="M3 15h18M12 5.5V7.5M5.3 8.3l1.4 1.4M18.7 8.3l-1.4 1.4" />
            <path d="M7 18.5h10" opacity=".55" />
          </svg>
        </div>
      </Press>
    </motion.div>
  )
}

// After the title screen hands over, lift the mode's colour off the mode so
// the hand-off reads as one continuous movement.
export function ArriveVeil({ mode }: { mode: Mode }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay: 0.05 }}
      style={{ position: 'fixed', inset: 0, background: MODE_BG[mode], pointerEvents: 'none', zIndex: 55 }}
    />
  )
}
