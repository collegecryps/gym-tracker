import { useRef, type ReactNode } from 'react'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Button that opens the camera (or photo library) and returns the chosen file. */
export function PhotoButton({ onPhoto, children, className = 'btn' }: { onPhoto: (f: File) => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className={className} onClick={() => ref.current?.click()}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPhoto(f)
        }}
      />
    </>
  )
}

export function Photo({ src, className }: { src: string; className?: string }) {
  return <img src={src} className={className} alt="" />
}

export function Bar({ label, value, target, unit = 'g' }: { label: string; value: number; target: number; unit?: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const over = value > target * 1.05
  return (
    <div className="bar">
      <div className="bar-top">
        <span>{label}</span>
        <span className={over ? 'warn' : ''}>
          {Math.round(value)} / {target}
          {unit}
        </span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${over ? 'over' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
