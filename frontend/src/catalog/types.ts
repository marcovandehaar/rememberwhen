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

export type Memory = {
  id: string
  name: string
  destinationName: string
  destinationCoordinate: Coordinate
  coverImage: string
  chapters: Chapter[]
}

export type Catalog = {
  schemaVersion: number
  memories: Memory[]
}
