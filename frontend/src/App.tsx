import { useEffect, useState } from 'react'
import type { Catalog, Memory, MediaItem } from './catalog/types'
import { Globe } from './globe/Globe'
import { Story } from './story/Story'
import { Lightbox } from './story/Lightbox'

// #30: the real Indexer publishes catalog.json (+ media/) to the webroot
// root, alongside this app — see deploy-nas.ps1's -IndexerOutput.
const CATALOG_URL = '/catalog.json'

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [selected, setSelected] = useState<Memory | null>(null)
  const [openItem, setOpenItem] = useState<{ item: MediaItem; startAt?: number } | null>(null)

  useEffect(() => {
    // Every real Indexer run replaces this file in place (#30) — without
    // this, a browser that already cached one response has no reason to
    // ever ask again, so a newly published Memory silently never appears.
    fetch(CATALOG_URL, { cache: 'no-store' })
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
      {selected && (
        <Story memory={selected} onOpenItem={(item, startAt) => setOpenItem({ item, startAt })} onBack={backToGlobe} />
      )}
      {openItem && <Lightbox item={openItem.item} startAt={openItem.startAt} onClose={() => setOpenItem(null)} />}
    </>
  )
}

export default App
