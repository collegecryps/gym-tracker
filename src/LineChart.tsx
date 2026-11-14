import { useState } from 'react'
import { prettyDate } from './helpers'

export interface Point {
  date: string // YYYY-MM-DD
  value: number
  note?: string // extra detail shown when tapped, e.g. "185 × 6"
}

/**
 * Single-series line chart over time. Tap (or hover) near a point to read it.
 * One series only, so no legend: the title names it.
 */
export function LineChart({
  title,
  points,
  unit,
  target,
  targetLabel = 'target',
}: {
  title: string
  points: Point[]
  unit: string
  target?: number
  targetLabel?: string
}) {
  const [sel, setSel] = useState<number | null>(null)
  if (points.length === 0) return null

  const W = 340
  const H = 150
  const padL = 8
  const padR = 8
  const padT = 10
  const padB = 10
  const ts = points.map((p) => new Date(p.date + 'T12:00').getTime())
  const t0 = Math.min(...ts)
  const t1 = Math.max(...ts)
  const vals = points.map((p) => p.value).concat(target !== undefined ? [target] : [])
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  const pad = Math.max(1, (hi - lo) * 0.1)
  lo -= pad
  hi += pad
  const x = (t: number) => (t1 === t0 ? W / 2 : padL + ((t - t0) / (t1 - t0)) * (W - padL - padR))
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(ts[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  const active = sel ?? points.length - 1
  const ap = points[active]
  const fmt = (v: number) => `${Math.round(v).toLocaleString()} ${unit}`.trim()

  function pick(clientX: number, el: SVGSVGElement) {
    const r = el.getBoundingClientRect()
    const px = ((clientX - r.left) / r.width) * W
    let best = 0
    for (let i = 1; i < ts.length; i++) if (Math.abs(x(ts[i]) - px) < Math.abs(x(ts[best]) - px)) best = i
    setSel(best)
  }

  return (
    <div className="chart-card">
      <div className="chart-title">
        <span>{title}</span>
        <span className="chart-readout">
          <strong>{fmt(ap.value)}</strong>
          <span className="muted small">
            {' '}
            {ap.note ? `${ap.note} · ` : ''}
            {prettyDate(ap.date)}
          </span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        role="img"
        aria-label={`${title}: ${points.length} points, latest ${fmt(points[points.length - 1].value)}`}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons) && pick(e.clientX, e.currentTarget)}
      >
        {target !== undefined && <line x1={0} x2={W} y1={y(target)} y2={y(target)} className="target-line" />}
        <line x1={x(ts[active])} x2={x(ts[active])} y1={padT - 6} y2={H - padB + 6} className="crosshair" />
        {points.length > 1 && <path d={path} className="trend" />}
        {points.map((p, i) => (
          <circle key={p.date + i} cx={x(ts[i])} cy={y(p.value)} r={i === active ? 5.5 : 4} className={i === active ? 'pt on' : 'pt'} />
        ))}
      </svg>
      <div className="chart-axis muted small">
        <span>{prettyDate(points[0].date)}</span>
        {target !== undefined && (
          <span>
            <span className="target-swatch" /> {targetLabel} {fmt(target)}
          </span>
        )}
        <span>{prettyDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  )
}
