// The Indexer -> frontend contract (docs/v1-build-spec.md §2). Additive
// only — a renderer must never depend on a field not listed here.

export type Coordinate = {
  lat: number
  lon: number
}

export type StoryRect = {
  x: number
  y: number
  width: number
  height: number
}

export type MediaKind = 'photo' | 'video'

export type MediaItem = {
  id: string
  mediaRef: string
  type: MediaKind
  capturedAt: string | null
  storyRect: StoryRect
  shotDuration: number
}

export type Chapter = {
  id: string
  location: Coordinate | null
  mediaItems: MediaItem[]
}

export type Destination = {
  name: string
  coordinate: Coordinate
}

export type Memory = {
  id: string
  name: string
  /** A Memory with a Destination is a Trip; the globe shows only those. */
  destination: Destination | null
  /** The day the Memory began, yyyy-mm-dd; its year is the year of this date. */
  date: string
  coverImage: string
  /** Mid-size cover for the timeline's polaroids; absent until the Memory's next reindex or cover change. */
  coverPhoto?: string | null
  chapters: Chapter[]
}

export type Catalog = {
  schemaVersion: number
  memories: Memory[]
}
