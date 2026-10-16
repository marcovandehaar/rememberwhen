// PROTOTYPE — throwaway (#75). Three alternative looks for the title screen.
export type Theme = {
  key: string
  name: string
  sky: string
  /** where the sun (or the glow behind the horizon) sits, in % of the screen */
  sun: { x: number; y: number }
  /** colour of the lit side of a cloud, and of its shaded side */
  light: string
  shade: string
  /** the title's text gradient and its glint */
  title: [string, string, string]
  glint: [string, string, string]
}

export const THEMES: Theme[] = [
  {
    key: 'A',
    name: 'Gouden uur',
    sky: 'linear-gradient(180deg, #0c3238 0%, #25555a 28%, #8a6a45 52%, #e0914a 68%, #f7bd6a 80%, #ffe0a0 100%)',
    sun: { x: 50, y: 74 },
    light: '#ffd27a',
    shade: '#06181c',
    title: ['#fff6e0', '#ffe3a8', '#ffc56b'],
    glint: ['#ffd27a', '#ffffff', '#9fe0d8'],
  },
  {
    key: 'B',
    name: 'Violette dageraad',
    sky: 'linear-gradient(180deg, #2a55c4 0%, #6a6fdc 26%, #c58ad2 50%, #f6a7b8 66%, #ffcfae 80%, #fff0d4 100%)',
    sun: { x: 50, y: 72 },
    light: '#ffd9ee',
    shade: '#41307f',
    title: ['#ffffff', '#ffe9f4', '#ffc6e0'],
    glint: ['#ffd1ea', '#ffffff', '#b9c6ff'],
  },
  {
    key: 'C',
    name: 'Rand van de aarde',
    sky: 'linear-gradient(180deg, #02040a 0%, #050c1f 45%, #0b1d44 70%, #1c4a8a 86%, #7fb4f0 100%)',
    sun: { x: 50, y: 80 },
    light: '#a8d0ff',
    shade: '#070d1e',
    title: ['#ffffff', '#e2eeff', '#a9c8ff'],
    glint: ['#8fc4ff', '#ffffff', '#ffd9a0'],
  },
]

export const ORIGINAL = 'O'
