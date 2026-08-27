import { useEffect, useState } from 'react'

// The facts the globe research marked [UNESTABLISHED] because they cannot be
// read out of documentation — they come from the driver on the actual device.
// Issue #7 says whichever prototype runs first must carry this.

type Caps = {
  webgl2: boolean
  maxTextureSize: number | null
  astc: boolean
  etc2: boolean
  pvrtc: boolean
  renderer: string
  dpr: number
  screen: string
}

function readCaps(): Caps {
  const canvas = document.createElement('canvas')
  const gl2 = canvas.getContext('webgl2')
  const gl = (gl2 ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
  if (!gl) {
    return {
      webgl2: false, maxTextureSize: null, astc: false, etc2: false, pvrtc: false,
      renderer: 'NO WEBGL (Lockdown Mode?)', dpr: window.devicePixelRatio,
      screen: `${window.innerWidth}x${window.innerHeight}`,
    }
  }
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  return {
    webgl2: !!gl2,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    astc: !!gl.getExtension('WEBGL_compressed_texture_astc'),
    etc2: !!gl.getExtension('WEBGL_compressed_texture_etc'),
    pvrtc: !!gl.getExtension('WEBGL_compressed_texture_pvrtc'),
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'masked',
    dpr: window.devicePixelRatio,
    screen: `${window.innerWidth}x${window.innerHeight}`,
  }
}

/** Texture memory for an uncompressed RGBA8 equirectangular earth, with mips. */
function textureCost(px: number): string {
  const bytes = px * (px / 2) * 4 * 1.333
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

export function DeviceHud() {
  const [caps] = useState(readCaps)
  const [fps, setFps] = useState(0)
  const [low, setLow] = useState(Infinity)
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
        position: 'fixed', top: 'env(safe-area-inset-top, 0px)', left: 0, zIndex: 20,
        margin: 8, padding: open ? '8px 10px' : '6px 9px', borderRadius: 8,
        background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)',
        color: '#e5e7eb', font: '11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
        maxWidth: 260, cursor: 'pointer', WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      <div style={{ color: colour, fontWeight: 700 }}>
        {fps} fps {low < Infinity && <span style={{ opacity: 0.6 }}>(min {low})</span>}
      </div>
      {open && (
        <div style={{ marginTop: 6, opacity: 0.9 }}>
          <div>WebGL2: {caps.webgl2 ? 'yes' : 'NO'}</div>
          <div>MAX_TEXTURE_SIZE: {caps.maxTextureSize ?? '—'}</div>
          {caps.maxTextureSize && (
            <div style={{ opacity: 0.65 }}>
              4K {textureCost(4096)} · 8K {textureCost(8192)}
            </div>
          )}
          <div>ASTC: {caps.astc ? 'yes' : 'no'} · ETC2: {caps.etc2 ? 'yes' : 'no'} · PVRTC: {caps.pvrtc ? 'yes' : 'no'}</div>
          <div>DPR: {caps.dpr} · {caps.screen}</div>
          <div style={{ opacity: 0.65, wordBreak: 'break-word' }}>{caps.renderer}</div>
          <div style={{ marginTop: 5, opacity: 0.55 }}>tik om in te klappen</div>
        </div>
      )}
    </div>
  )
}
