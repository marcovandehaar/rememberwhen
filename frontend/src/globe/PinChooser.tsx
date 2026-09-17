import type { Memory } from '../catalog/types'
import { latestCapturedAt, type Pin } from './pins'

// #11/#32: a thumb-friendly bottom sheet, not a menu anchored to the pin's
// screen position — the pin itself is mid-flight (the camera is still
// animating in) when this appears, so there's no stable point to anchor to.
// ~4 rows visible before scrolling, per the acceptance criterion.
const ROW_HEIGHT = 68

export function PinChooser({ pin, onChoose, onDismiss }: { pin: Pin; onChoose: (memory: Memory) => void; onDismiss: () => void }) {
  const byNewestFirst = [...pin.memories].sort((a, b) => latestCapturedAt(b) - latestCapturedAt(a))

  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: ROW_HEIGHT * 4 + 52,
          overflowY: 'auto',
          background: '#12151c',
          borderRadius: '18px 18px 0 0',
          padding: '4px 4px 8px',
        }}
      >
        <div
          style={{
            padding: '14px 12px 10px',
            color: '#fff',
            font: '600 15px/1.3 -apple-system,system-ui,sans-serif',
            textAlign: 'center',
          }}
        >
          {pin.destinationName}
        </div>
        {byNewestFirst.map((memory) => (
          <button
            key={memory.id}
            onClick={() => onChoose(memory)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              width: '100%',
              height: ROW_HEIGHT,
              padding: '0 12px',
              background: 'none',
              border: 'none',
              borderTop: '1px solid rgba(255,255,255,.08)',
              color: '#fff',
              font: '500 15px/1.3 -apple-system,system-ui,sans-serif',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <img
              src={memory.coverImage}
              alt=""
              style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
            />
            <span>{memory.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
