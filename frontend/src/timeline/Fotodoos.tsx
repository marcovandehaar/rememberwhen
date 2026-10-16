import { motion } from 'framer-motion'
import { SF } from '../title/modes'
import { Press } from '../title/Press'
import { countLabel, stackCovers, type YearPage } from './timelineData'
import { Dymo } from './Dymo'
import { INK, PINS, WALL } from './wallStyle'

const ROTATE = [-7, 5, -1]
const SHIFT_X = [-6, 6, 0]
const SHIFT_Y = [4, -2, 0]

/**
 * The wall zoomed out to a table: one stack of polaroids per year. Opens
 * scrolled to the current year (the red pin); a tap on a stack lands on that
 * year, a tap beside the stacks closes it.
 */
export function Fotodoos({ pages, current, onPick, onClose }: {
  pages: YearPage[]
  current: number
  onPick: (index: number) => void
  onClose: () => void
}) {
  return (
    <motion.div
      data-testid="fotodoos"
      initial={{ opacity: 0, scale: 1.12 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.12 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={onClose}
      ref={(el) => {
        // open on the year you came from
        const cur = el?.querySelector<HTMLElement>('[data-current]')
        if (el && cur && !el.dataset.placed) {
          el.dataset.placed = '1'
          el.scrollTop = cur.offsetTop - el.clientHeight / 2 + cur.offsetHeight / 2
        }
      }}
      style={{ position: 'absolute', inset: 0, zIndex: 20, overflowY: 'auto', ...WALL }}
    >
      <div
        style={{
          maxWidth: 1040,
          margin: '0 auto',
          padding: 'calc(110px + env(safe-area-inset-top)) 5vw 140px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          gap: '46px 4vw',
        }}
      >
        {pages.map((page, k) => (
          <div key={page.year} data-current={k === current ? '' : undefined}>
            {/* only the stack and its label count as a tap on the year; the rest of the cell closes the overview */}
            <div onClick={(ev) => ev.stopPropagation()} style={{ width: '78%', margin: '0 auto' }}>
            <Press onTap={() => onPick(k)} label={`${page.year}, ${countLabel(page.memories.length)}`} style={{ display: 'block', width: '100%' }}>
              <div style={{ position: 'relative', aspectRatio: '0.86' }}>
                {stackCovers(page).map((cover, s) => (
                  <div
                    key={s}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: '#fffdf7',
                      padding: '7% 7% 24%',
                      boxShadow: '0 6px 14px rgba(70,45,15,.22)',
                      transform: `rotate(${ROTATE[s]}deg) translate(${SHIFT_X[s]}px, ${SHIFT_Y[s]}px)`,
                      zIndex: s,
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', background: '#d9cdb8' }}>
                      <img src={cover} alt="" loading="lazy" decoding="async" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'sepia(.14) contrast(.95)' }} />
                    </div>
                  </div>
                ))}
                {k === current && (
                  <span
                    data-testid="current-year-pin"
                    style={{
                      position: 'absolute',
                      top: -9,
                      left: '50%',
                      marginLeft: -9,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      zIndex: 9,
                      background: `radial-gradient(circle at 35% 32%, rgba(255,255,255,.75) 0 12%, ${PINS[0]} 40%, rgba(0,0,0,.35) 100%)`,
                      boxShadow: '1px 3px 3px rgba(0,0,0,.3)',
                    }}
                  />
                )}
              </div>
              <div style={{ marginTop: 18, textAlign: 'center' }}>
                <Dymo>{page.year}</Dymo>
                <div style={{ marginTop: 8, font: `400 13px/1 ${SF}`, color: INK, opacity: 0.55 }}>{countLabel(page.memories.length)}</div>
              </div>
            </Press>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
