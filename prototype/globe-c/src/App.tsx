import { useCallback, useEffect, useState } from 'react'
import { DESTINATIONS, type Destination } from './destinations'
import { DeviceHud } from './DeviceHud'
import { DebugPanel } from './DebugPanel'
import { DEFAULTS, settingsKey, type Settings } from './settings'
import { PrototypeSwitcher, type VariantKey } from './PrototypeSwitcher'
import { VariantA, NAME as NAME_A } from './variants/VariantA'
import { VariantB, NAME as NAME_B } from './variants/VariantB'
import { VariantC, NAME as NAME_C } from './variants/VariantC'
import { VariantD, NAME as NAME_D } from './variants/VariantD'

// Prototype for issue #7: three looks of globe.gl pushed past its defaults,
// switchable via ?variant=. Throwaway code — no tests, no error handling.

const VARIANTS: VariantKey[] = ['A', 'B', 'C', 'D']
const NAMES: Record<VariantKey, string> = { A: NAME_A, B: NAME_B, C: NAME_C, D: NAME_D }

function readVariant(): VariantKey {
  const v = new URLSearchParams(location.search).get('variant')?.toUpperCase()
  return (VARIANTS as string[]).includes(v ?? '') ? (v as VariantKey) : 'A'
}

export function App() {
  const [variant, setVariant] = useState<VariantKey>(readVariant)
  const [selected, setSelected] = useState<Destination | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  const change = useCallback((v: VariantKey) => {
    const url = new URL(location.href)
    url.searchParams.set('variant', v)
    history.replaceState(null, '', url)
    setSelected(null)
    setVariant(v)
  }, [])

  useEffect(() => {
    const onPop = () => setVariant(readVariant())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Remount on variant OR settings change: each owns its own render pipeline,
  // and the bloom/MSAA/DPR toggles change how that pipeline is built.
  const k = `${variant}-${settingsKey(settings)}`
  const props = { data: DESTINATIONS, selected, onSelect: setSelected, settings }

  return (
    <>
      {variant === 'A' && <VariantA key={k} {...props} />}
      {variant === 'B' && <VariantB key={k} {...props} />}
      {variant === 'C' && <VariantC key={k} {...props} />}
      {variant === 'D' && <VariantD key={k} {...props} />}

      <DeviceHud resetKey={k} />
      {!import.meta.env.PROD && (
        <>
          <DebugPanel settings={settings} onChange={setSettings} />
          <PrototypeSwitcher variants={VARIANTS} current={variant} names={NAMES} onChange={change} />
        </>
      )}
    </>
  )
}
