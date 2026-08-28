// Live toggles for the two puzzles the iPad surfaced (see issue #7):
//   - the HUD read 21 fps at DPR 2
//   - the background washes out on iPadOS but not on Chromium
// Both suspects live here, so they can be isolated on the device instead of
// guessed at on the laptop.

export type Settings = {
  /** UnrealBloomPass on globe.gl's own composer. */
  bloom: boolean
  /** samples on the composer's render targets, to claw back the MSAA that
   *  the second pass costs. 0 = leave globe.gl's default (no samples). */
  msaa: boolean
  /** renderer pixel ratio: the device's own (2 here) or forced to 1. */
  fullDpr: boolean
  autoRotate: boolean
}

// Static by default: Marco wants the globe to hold still, both at open and
// after a pin's camera move. Rotation is a toggle, not the resting state.
export const DEFAULTS: Settings = { bloom: true, msaa: true, fullDpr: true, autoRotate: false }

/** Remount key — any change has to rebuild the globe's render pipeline. */
export function settingsKey(s: Settings): string {
  return `${s.bloom ? 'b' : ''}${s.msaa ? 'm' : ''}${s.fullDpr ? 'd' : ''}${s.autoRotate ? 'r' : ''}`
}
