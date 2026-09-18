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

const EARTH_RADIUS_KM = 6371

function greatCircleDistanceKm(a: Pin, b: Pin): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

// #43: the nearest *other* Destination in one direction from `from` —
// filtered by longitude comparison first (v1 has no wraparound at the
// antimeridian), then the closest of what's left by great-circle distance,
// not screen position (PinChooser's arrows work the same in any camera angle).
export function nearestPin(pins: Pin[], from: Pin, direction: 'west' | 'east'): Pin | null {
  const candidates = pins.filter((p) => (direction === 'west' ? p.lng < from.lng : p.lng > from.lng))
  if (candidates.length === 0) return null
  return candidates.reduce((nearest, p) => (greatCircleDistanceKm(from, p) < greatCircleDistanceKm(from, nearest) ? p : nearest))
}
