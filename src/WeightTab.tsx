import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, daysAgoStr, todayStr, type Profile, type WeighIn } from './db'
import { prettyDate, useTargets } from './helpers'

export function WeightTab({ profile }: { profile: Profile }) {
  const targets = useTargets(profile)
  const weighIns = useLiveQuery(() => db.weighIns.where('date').aboveOrEqual(daysAgoStr(90)).sortBy('date'), [])
  const todays = weighIns?.find((w) => w.date === todayStr())
  const [val, setVal] = useState('')

  async function save() {
    const n = +val
    if (!(n >= 80 && n <= 500)) return
    await db.weighIns.put({ ...(todays?.id !== undefined ? { id: todays.id } : {}), date: todayStr(), weightLb: n })
    setVal('')
  }

  return (
    <div className="page">
      <h1>Weight</h1>

      <div className="card">
        <p className="muted small">Weigh in every morning, after the bathroom, before eating.</p>
        <div className="row">
          <input
            className="big-input"
            inputMode="decimal"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={todays ? `Today: ${todays.weightLb}` : 'Today’s weight (lb)'}
          />
          <button className="btn" onClick={save}>
            {todays ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      {weighIns && weighIns.length > 1 && <Chart data={weighIns} />}

      {targets && (
        <div className="card">
          <div className="stats">
            <div>
              <strong>{targets.currentWeight.toFixed(1)}</strong>
              <span className="muted small">7-day avg lb</span>
            </div>
            <div>
              <strong>{targets.actualRateLb === null ? '–' : `${targets.actualRateLb >= 0 ? '+' : ''}${targets.actualRateLb.toFixed(2)}`}</strong>
              <span className="muted small">lb / week</span>
            </div>
            <div>
              <strong>
                {targets.targetRateLb >= 0 ? '+' : '−'}
                {Math.abs(targets.targetRateLb).toFixed(2)}
              </strong>
              <span className="muted small">target / week</span>
            </div>
          </div>
          <p className="tip">{targets.coaching}</p>
          {targets.custom ? (
            <p className="muted small">
              Your own targets, every day: {targets.calories} cal · {targets.protein}g protein · {targets.carbs}g carbs · {targets.fat}g fat.
              Maintenance ≈ {targets.tdee} cal ({targets.tdeeSource === 'formula' ? 'formula estimate' : 'learned from your logs'}).
            </p>
          ) : (
          <p className="muted small">
            Rest-day plan: {targets.baseCalories} cal · {targets.protein}g protein · {targets.fat}g fat, rest from carbs. Lifting days add
            what the lift burned, as carbs. Rest-day maintenance ≈ {targets.tdee} cal ({targets.tdeeSource === 'formula' ? 'formula estimate until you have 2–3 weeks of data' : 'learned from your logs'}).
          </p>
          )}
        </div>
      )}

      <div className="list">
        {[...(weighIns ?? [])].reverse().slice(0, 14).map((w) => (
          <div key={w.id} className="list-item">
            <span className="grow">{prettyDate(w.date)}</span>
            <strong>{w.weightLb}</strong>
            <button className="icon-btn" onClick={() => w.id !== undefined && confirm('Delete this weigh-in?') && db.weighIns.delete(w.id)} aria-label="Delete">
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Chart({ data }: { data: WeighIn[] }) {
  const W = 340
  const H = 160
  const pad = 8
  const ts = data.map((d) => new Date(d.date + 'T12:00').getTime())
  const t0 = Math.min(...ts)
  const t1 = Math.max(...ts)
  const avg = data.map((_, i) => {
    const win = data.slice(Math.max(0, i - 6), i + 1)
    return win.reduce((s, w) => s + w.weightLb, 0) / win.length
  })
  const all = data.map((d) => d.weightLb)
  const lo = Math.min(...all) - 1
  const hi = Math.max(...all) + 1
  const x = (t: number) => pad + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad)
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (H - 2 * pad)
  const line = avg.map((v, i) => `${i ? 'L' : 'M'}${x(ts[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  return (
    <div className="card">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Weight trend">
        {data.map((d, i) => (
          <circle key={d.date} cx={x(ts[i])} cy={y(d.weightLb)} r={2.5} className="dot" />
        ))}
        <path d={line} className="trend" />
      </svg>
      <div className="row muted small chart-legend">
        <span>{hi.toFixed(0)} lb top</span>
        <span>dots = daily · line = 7-day average</span>
        <span>{lo.toFixed(0)} lb bottom</span>
      </div>
    </div>
  )
}
