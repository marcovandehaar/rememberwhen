import { useEffect, useState } from 'react'

// The facts issue #6 says to settle while we are on the device, because none
// of them can be read out of documentation.

type Caps = {
  scrollTimeline: boolean
  animationRange: boolean
  viewTransition: boolean
  hevc: string
  dpr: number
  screen: string
}

function readCaps(): Caps {
  const v = document.createElement('video')
  return {
    scrollTimeline: CSS.supports('animation-timeline: scroll(root block)'),
    animationRange: CSS.supports('animation-range: 10% 20%'),
    viewTransition: typeof (document as unknown as { startViewTransition?: unknown }).startViewTransition === 'function',
    // The clips are straight off an iPhone: HEVC in a QuickTime container.
    hevc: v.canPlayType('video/mp4; codecs="hvc1"') || v.canPlayType('video/quicktime') || 'no',
    dpr: window.devicePixelRatio,
    screen: `${window.innerWidth}x${window.innerHeight}`,
  }
}

export function DeviceHud() {
  const [caps] = useState(readCaps)
  const [fps, setFps] = useState(0)
  const [low, setLow] = useState(Infinity)
  const [playing, setPlaying] = useState(0)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const tick = () => {
      frames++
      const now = performance.now()
      if (now - last >= 500) {
        const v = Math.round((frames * 1000) / (now - last))
        setFps(v)
        setLow((l) => Math.min(l, v))
        // How many <video> elements are actually decoding right now — the
        // OS/VideoToolbox limit the research could not find a number for.
        setPlaying([...document.querySelectorAll('video')].filter((el) => !el.paused && !el.ended).length)
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const colour = fps >= 50 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171'

  return (
    <div
      onClick={() => setOpen((o) => !o)}
      style={{
        position: 'fixed',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0,
        zIndex: 30,
        margin: 8,
        padding: open ? '8px 10px' : '6px 9px',
        borderRadius: 8,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        color: '#e5e7eb',
        font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        maxWidth: 250,
        cursor: 'pointer',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <div style={{ color: colour, fontWeight: 700 }}>
        {fps} fps {low < Infinity && <span style={{ opacity: 0.6 }}>(min {low})</span>}
        <span style={{ opacity: 0.75, color: '#e5e7eb', fontWeight: 400 }}> · {playing} video</span>
      </div>
      {open && (
        <div style={{ marginTop: 6, opacity: 0.9 }}>
          <div>scroll-timeline: {caps.scrollTimeline ? 'yes' : 'NO'}</div>
          <div>animation-range: {caps.animationRange ? 'yes' : 'NO'}</div>
          <div>view transitions: {caps.viewTransition ? 'yes' : 'no'}</div>
          <div>hevc/mov: {caps.hevc || 'no'}</div>
          <div>DPR: {caps.dpr} · {caps.screen}</div>
          <div style={{ marginTop: 5, opacity: 0.55 }}>tik om in te klappen</div>
        </div>
      )}
    </div>
  )
}
