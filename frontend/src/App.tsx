import { useEffect, useState } from 'react'
import type { Catalog, Memory, MediaItem } from './catalog/types'
import { Globe } from './globe/Globe'
import { Story } from './story/Story'
import { Lightbox } from './story/Lightbox'
// PROTOTYPE (#58): title screen + way back, see TitleScreenPrototype.tsx.
import { ArriveVeil, BackToTitle, TitleScreenPrototype, type Mode } from './title/TitleScreenPrototype'
// PROTOTYPE (#59): the timeline mode, see TimelinePrototype.tsx.
import { TimelinePrototype } from './timeline/TimelinePrototype'

// #30: the real Indexer publishes catalog.json (+ media/) to the webroot
// root, alongside this app — see deploy-nas.ps1's -IndexerOutput.
const CATALOG_URL = '/catalog.json'

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [returningFrom, setReturningFrom] = useState<Mode | null>(null)
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

  if (!mode) {
    return <TitleScreenPrototype memories={catalog.memories} returningFrom={returningFrom} onChoose={setMode} />
  }

  const backToMode = () => {
    setSelected(null)
    window.scrollTo(0, 0)
  }
  const backToTitle = () => {
    setReturningFrom(mode)
    setMode(null)
  }

  return (
    <>
      {!selected && mode === 'globe' && <Globe memories={catalog.memories} onSelect={setSelected} />}
      {mode === 'timeline' && <TimelinePrototype memories={catalog.memories} hidden={!!selected} onOpen={setSelected} />}
      {!selected && <BackToTitle onBack={backToTitle} light={mode === 'timeline'} />}
      <ArriveVeil key={mode} mode={mode} />
      {selected && (
        <Story memory={selected} onOpenItem={(item, startAt) => setOpenItem({ item, startAt })} onBack={backToMode} />
      )}
      {openItem && <Lightbox item={openItem.item} startAt={openItem.startAt} onClose={() => setOpenItem(null)} />}
    </>
  )
}

export default App
