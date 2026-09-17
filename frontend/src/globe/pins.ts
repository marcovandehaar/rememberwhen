import type { Memory } from '../catalog/types'

// #11's decision: a pin is keyed on Destination-naam, not on a separate
// identity — grouping happens here, client-side, from fields the catalogue
// already publishes. Because a Destination's coordinate comes from its name
// via the Gazetteer (ADR 0005), every Memory in a group shares the exact
// same coordinate; no proximity threshold is needed.
export type Pin = {
  destinationName: string
  lat: number
  lng: number
  /** The newest Memory's cover — #11: multiple Memories on one pin show the most recent trip's photo. */
  cover: string
  memories: Memory[]
}

/** Latest non-null capturedAt across every Media Item, as epoch ms — -Infinity if the Memory has none. */
export function latestCapturedAt(memory: Memory): number {
  let latest = -Infinity
  for (const chapter of memory.chapters) {
    for (const item of chapter.mediaItems) {
      if (item.capturedAt === null) continue
      const t = new Date(item.capturedAt).getTime()
      if (t > latest) latest = t
    }
  }
  return latest
}

export function pinsFor(memories: Memory[]): Pin[] {
  const byDestination = new Map<string, Memory[]>()
  for (const memory of memories) {
    const group = byDestination.get(memory.destinationName)
    if (group) group.push(memory)
    else byDestination.set(memory.destinationName, [memory])
  }

  return [...byDestination.entries()].map(([destinationName, group]) => {
    const newest = group.reduce((a, b) => (latestCapturedAt(b) > latestCapturedAt(a) ? b : a))
    return {
      destinationName,
      lat: newest.destinationCoordinate.lat,
      lng: newest.destinationCoordinate.lon,
      cover: newest.coverImage,
      memories: group,
    }
  })
}
