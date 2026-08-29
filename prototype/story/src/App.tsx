import { useState } from 'react'
import { VariantA, NAME as NAME_A } from './variants/VariantA'
import { DeviceHud } from './DeviceHud'
import { Lightbox } from './Lightbox'
import type { Beat } from './story'

// Prototype for issue #6: does a scroll-driven cinematic story feel like
// reliving, or like scrubbing? Throwaway — no tests, no error handling.

export function App() {
  const [open, setOpen] = useState<Beat | null>(null)

  return (
    <>
      <VariantA onOpen={setOpen} />
      <DeviceHud />
      {open && <Lightbox beat={open} onClose={() => setOpen(null)} />}
    </>
  )
}
