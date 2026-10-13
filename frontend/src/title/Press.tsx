import { motion } from 'framer-motion'
import type { CSSProperties, ReactNode } from 'react'

export function Press({ onTap, label, children, style }: {
  onTap: () => void
  label?: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onTap}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ all: 'unset', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', ...style }}
    >
      {children}
    </motion.button>
  )
}
