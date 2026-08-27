import { useCallback, useEffect, useState } from 'react'
import { DESTINATIONS, type Destination } from './destinations'
import { DeviceHud } from './DeviceHud'
import { PrototypeSwitcher, type VariantKey } from './PrototypeSwitcher'
import { VariantA, NAME as NAME_A } from './variants/VariantA'
import { VariantB, NAME as NAME_B } from './variants/VariantB'
import { VariantC, NAME as NAME_C } from './variants/VariantC'

// Prototype for issue #7: three looks of globe.gl pushed past its defaults,
// switchable via ?variant=. Throwaway code — no tests, no error handling.

const VARIANTS: VariantKey[] = ['A', 'B', 'C']
const NAMES: Record<VariantKey, string> = { A: NAME_A, B: NAME_B, C: NAME_C }

function readVariant(): VariantKey {
  const v = new URLSearchParams(location.search).get('variant')?.toUpperCase()
  return (VARIANTS as string[]).includes(v ?? '') ? (v as VariantKey) : 'A'
}

export function App() {
  const [variant, setVariant] = useState<VariantKey>(readVariant)
  const [selected, setSelected] = useState<Destination | null>(null)

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

  return (
    <>
      {/* Remount on variant change: each variant owns its own globe instance. */}
      {variant === 'A' && <VariantA key="A" data={DESTINATIONS} selected={selected} onSelect={setSelected} />}
      {variant === 'B' && <VariantB key="B" data={DESTINATIONS} selected={selected} onSelect={setSelected} />}
      {variant === 'C' && <VariantC key="C" data={DESTINATIONS} selected={selected} onSelect={setSelected} />}

      <DeviceHud />
      {!import.meta.env.PROD && (
        <PrototypeSwitcher variants={VARIANTS} current={variant} names={NAMES} onChange={change} />
      )}
    </>
  )
}
