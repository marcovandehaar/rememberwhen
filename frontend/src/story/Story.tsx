import { useEffect, useMemo, useRef, useState } from 'react'
import type { Memory } from '../catalog/types'
import { beats, chapterTimeRange, type Beat } from './beats'
import { kenBurnsTransform, opacityAt } from './kenBurns'
import { buildPlan } from './plan'
import { HAS_SCROLL_TIMELINE } from './platform'
import { scrollProgress } from './scrollProgress'
import { useContainerAspect } from './useContainerAspect'
import { useScrollWindow } from './useScrollWindow'

type NaturalSize = { width: number; height: number }
// Assumed until the real image loads and reports its own size — zero
// degrades kenBurnsTransform to identity, which is a safe default.
const FALLBACK_SIZE: NaturalSize = { width: 0, height: 0 }

export function Story({ memory, onOpenItem }: { memory: Memory; onOpenItem: (item: Beat['item']) => void }) {
  const list = useMemo(() => beats(memory), [memory])
  const { index, isMounted } = useScrollWindow(list.length)
  const containerAspect = useContainerAspect()
  const shotRefs = useRef(new Map<number, HTMLDivElement>())
  const videoRefs = useRef(new Map<string, HTMLVideoElement>())
  const [sizes, setSizes] = useState<Map<string, NaturalSize>>(new Map())

  const { totalUnits, entries: plan } = useMemo(() => buildPlan(list), [list])

  const sizeFor = (id: string) => sizes.get(id) ?? FALLBACK_SIZE

  const onImageLoad = (id: string, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setSizes((prev) => {
      const next = new Map(prev)
      next.set(id, { width: img.naturalWidth, height: img.naturalHeight })
      return next
    })
  }

  // --- path 1: the platform does it -------------------------------------
  const css = useMemo(() => {
    if (!HAS_SCROLL_TIMELINE) return ''
    return plan
      .map(({ b, start, end, first, last }) => {
        const size = sizeFor(b.item.id)
        const t0 = kenBurnsTransform(b.item.storyRect, size.width, size.height, containerAspect, 0)
        const t1 = kenBurnsTransform(b.item.storyRect, size.width, size.height, containerAspect, 1)
        return `
        #shot-${b.i} {
          animation: shot-${b.i} linear both;
          animation-timeline: scroll(root block);
          animation-range: ${(start * 100).toFixed(4)}% ${(end * 100).toFixed(4)}%;
        }
        @keyframes shot-${b.i} {
          0%   { opacity: ${first ? 1 : 0}; transform: ${t0}; }
          14%  { opacity: 1; }
          86%  { opacity: 1; }
          100% { opacity: ${last ? 1 : 0}; transform: ${t1}; }
        }`
      })
      .join('\n')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, sizes, containerAspect])

  // --- path 2: we do it, because the platform cannot ---------------------
  useEffect(() => {
    if (HAS_SCROLL_TIMELINE) return
    let raf = 0
    let lastY = -1
    const tick = () => {
      const y = window.scrollY
      if (y === lastY) {
        raf = requestAnimationFrame(tick)
        return
      }
      lastY = y
      const t = scrollProgress()
      for (const { b, start, end, first, last } of plan) {
        const el = shotRefs.current.get(b.i)
        if (!el) continue
        const p = Math.min(1, Math.max(0, (t - start) / (end - start)))
        const size = sizeFor(b.item.id)
        el.style.opacity = String(opacityAt(p, first, last))
        el.style.transform = kenBurnsTransform(b.item.storyRect, size.width, size.height, containerAspect, p)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, sizes, containerAspect])

  // Only the shot under the finger plays, muted, ADR 0001 ("Video remains an
  // ordinary member of the sequence, muted and autoplaying while in view").
  // Sound only arrives via the Lightbox, where exactly one video is ever open.
  useEffect(() => {
    for (const [id, el] of videoRefs.current) {
      const b = list.find((x) => x.item.id === id)
      if (b && Math.abs(b.i - index) <= 1) el.play().catch(() => {})
      else el.pause()
    }
  }, [index, list])

  return (
    <>
      {css && <style>{css}</style>}

      {/* The scroll length. Nothing is painted here; it only makes the page tall. */}
      <div style={{ height: `${totalUnits * 100}svh` }} />

      <div style={{ position: 'fixed', inset: 0, background: '#000', overflow: 'hidden' }}>
        {plan.map(({ b, first }) => {
          if (!isMounted(b.i)) return null
          const size = sizeFor(b.item.id)

          return (
            <div
              key={b.item.id}
              id={`shot-${b.i}`}
              ref={(el) => {
                if (el) shotRefs.current.set(b.i, el)
                else shotRefs.current.delete(b.i)
              }}
              onClick={() => b.i === index && onOpenItem(b.item)}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: first ? 1 : 0,
                transform: kenBurnsTransform(b.item.storyRect, size.width, size.height, containerAspect, 0),
                willChange: 'opacity, transform',
                cursor: 'pointer',
                // Only the shot actually in view may be tapped — otherwise
                // the next shot sits invisibly on top and steals the tap.
                pointerEvents: b.i === index ? 'auto' : 'none',
              }}
            >
              {b.item.type === 'video' ? (
                <video
                  ref={(el) => {
                    if (el) videoRefs.current.set(b.item.id, el)
                    else videoRefs.current.delete(b.item.id)
                  }}
                  src={b.item.mediaRef}
                  muted
                  playsInline
                  loop
                  preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <img
                  src={b.item.mediaRef}
                  alt=""
                  onLoad={(e) => onImageLoad(b.item.id, e)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              )}

              {b.chapterStart && (
                <ChapterCard memory={memory} chapter={b.chapterStart} isFirst={b.i === 0} />
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function ChapterCard({ memory, chapter, isFirst }: { memory: Memory; chapter: Beat['chapterStart'] & object; isFirst: boolean }) {
  const range = chapterTimeRange(chapter)
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.15) 45%, rgba(0,0,0,.55))',
        textAlign: 'center',
        color: '#fff',
        pointerEvents: 'none',
      }}
    >
      <div>
        {isFirst && (
          <div
            style={{
              font: '500 13px/1 -apple-system, system-ui, sans-serif',
              letterSpacing: '.22em',
              textTransform: 'uppercase',
              opacity: 0.8,
            }}
          >
            {memory.destinationName}
          </div>
        )}
        <div
          style={{
            font: '600 40px/1.15 -apple-system, system-ui, sans-serif',
            marginTop: 14,
            textShadow: '0 2px 30px rgba(0,0,0,.6)',
          }}
        >
          {isFirst ? memory.name : range ?? ''}
        </div>
      </div>
    </div>
  )
}
