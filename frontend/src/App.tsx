import { useEffect, useState } from 'react'
import type { Catalog, Memory, MediaItem } from './catalog/types'
import { Globe } from './globe/Globe'
import { Story } from './story/Story'
import { Lightbox } from './story/Lightbox'

// #29: built against a handwritten sample catalog (public/sample-catalog.json)
// that follows the real schema — no dependency on real Indexer output.
const CATALOG_URL = '/sample-catalog.json'

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selected, setSelected] = useState<Memory | null>(null)
  const [openItem, setOpenItem] = useState<MediaItem | null>(null)

  useEffect(() => {
    fetch(CATALOG_URL)
      .then((r) => r.json())
      .then(setCatalog)
  }, [])

  if (!catalog) return null

  const backToGlobe = () => {
    setSelected(null)
    window.scrollTo(0, 0)
  }

  return (
    <>
      {!selected && <Globe memories={catalog.memories} onSelect={setSelected} />}
      {selected && <Story memory={selected} onOpenItem={setOpenItem} onBack={backToGlobe} />}
      {openItem && <Lightbox item={openItem} onClose={() => setOpenItem(null)} />}
    </>
  )
}

export default App
