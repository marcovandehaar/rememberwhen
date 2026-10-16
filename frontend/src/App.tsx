import { useEffect, useState } from 'react'
import type { Catalog, Memory, MediaItem } from './catalog/types'
import { Globe } from './globe/Globe'
import { Story } from './story/Story'
import { Lightbox } from './story/Lightbox'
import type { Mode } from './title/modes'
import { ArriveVeil, BackToTitle } from './title/ModeChrome'
import { TitleScreen } from './title/TitleScreen'
import { Timeline } from './timeline/Timeline'
import { TimelineView } from './timeline/timelineView'

// #30: the real Indexer publishes catalog.json (+ media/) to the webroot
// root, alongside this app — see deploy-nas.ps1's -IndexerOutput.
const CATALOG_URL = '/catalog.json'

function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  // null: the title screen. Every launch starts there, and a mode never
  // outlives a trip back to it, so the globe is on Europe again next time.
  const [mode, setMode] = useState<Mode | null>(null)
  const [returningFrom, setReturningFrom] = useState<Mode | null>(null)
  // Where the timeline was, for the way back from a Story; a trip to the title clears it.
  const [timelineView, setTimelineView] = useState(() => new TimelineView())
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
    return <TitleScreen memories={catalog.memories} returningFrom={returningFrom} onChoose={setMode} />
  }

  // Back from a Story to the mode it came from.
  const backToMode = () => {
    setSelected(null)
    window.scrollTo(0, 0)
  }
  const backToTitle = () => {
    setReturningFrom(mode)
    setTimelineView(new TimelineView())
    setMode(null)
  }

  return (
    <>
      {!selected && mode === 'globe' && <Globe memories={catalog.memories} onSelect={setSelected} />}
      {!selected && mode === 'timeline' && <Timeline memories={catalog.memories} view={timelineView} onOpen={setSelected} />}
      {!selected && <BackToTitle onBack={backToTitle} light={mode === 'timeline'} />}
      {!selected && <ArriveVeil key={mode} mode={mode} />}
      {selected && (
        <Story memory={selected} onOpenItem={(item, startAt) => setOpenItem({ item, startAt })} onBack={backToMode} />
      )}
      {openItem && <Lightbox item={openItem.item} startAt={openItem.startAt} onClose={() => setOpenItem(null)} />}
    </>
  )
}

export default App
