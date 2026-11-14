import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { analyzeFood, shrinkImage } from './ai'
import { db, todayStr, type Food, type Profile } from './db'
import { prettyDate, shiftDate, useTargets } from './helpers'
import { Bar, Photo, Modal, PhotoButton } from './ui'

type Draft = Omit<Food, 'id' | 'calories' | 'protein' | 'carbs' | 'fat'> & {
  id?: number
  calories: string
  protein: string
  carbs: string
  fat: string
}

function toDraft(f: Food): Draft {
  return { ...f, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat) }
}

export function FoodTab({ profile }: { profile: Profile }) {
  const [date, setDate] = useState(todayStr())
  const [draft, setDraft] = useState<Draft | null>(null)
  const targets = useTargets(profile)
  const foods = useLiveQuery(() => db.foods.where('date').equals(date).sortBy('time'), [date])

  const totals = (foods ?? []).reduce(
    (t, f) => ({ calories: t.calories + f.calories, protein: t.protein + f.protein, carbs: t.carbs + f.carbs, fat: t.fat + f.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )

  function blank(photo?: string): Draft {
    return { date, time: Date.now(), name: '', calories: '', protein: '', carbs: '', fat: '', photo, aiEstimated: false }
  }

  const left = targets ? targets.calories - totals.calories : 0

  return (
    <div className="page">
      <div className="date-nav">
        <button className="icon-btn" onClick={() => setDate(shiftDate(date, -1))}>
          ‹
        </button>
        <h1>{date === todayStr() ? 'Today' : prettyDate(date)}</h1>
        <button className="icon-btn" disabled={date >= todayStr()} onClick={() => setDate(shiftDate(date, 1))}>
          ›
        </button>
      </div>

      {targets && (
        <div className="card">
          <div className="big-number">
            <strong className={left < 0 ? 'warn' : ''}>{Math.abs(Math.round(left))}</strong>
            <span className="muted">{left >= 0 ? 'calories left' : 'calories over'}</span>
          </div>
          <Bar label="Calories" value={totals.calories} target={targets.calories} unit="" />
          <Bar label="Protein" value={totals.protein} target={targets.protein} />
          <Bar label="Carbs" value={totals.carbs} target={targets.carbs} />
          <Bar label="Fat" value={totals.fat} target={targets.fat} />
        </div>
      )}

      <div className="row">
        <PhotoButton onPhoto={async (f) => setDraft(blank(await shrinkImage(f)))}>📷 Snap food</PhotoButton>
        <button className="btn ghost" onClick={() => setDraft(blank())}>
          + Enter manually
        </button>
      </div>

      <div className="list">
        {foods?.length === 0 && <p className="muted center">Nothing logged yet.</p>}
        {foods?.map((f) => (
          <button key={f.id} className="list-item" onClick={() => setDraft(toDraft(f))}>
            {f.photo ? <Photo src={f.photo} className="thumb" /> : <div className="thumb empty">🍽</div>}
            <div className="grow">
              <div>{f.name || 'Food'}</div>
              <div className="muted small">
                {f.protein}p · {f.carbs}c · {f.fat}f{f.aiEstimated ? ' · photo estimate' : ''}
              </div>
            </div>
            <strong>{f.calories}</strong>
          </button>
        ))}
      </div>

      {draft && <FoodEditor profile={profile} draft={draft} onClose={() => setDraft(null)} />}
    </div>
  )
}

function FoodEditor({ profile, draft: initial, onClose }: { profile: Profile; draft: Draft; onClose: () => void }) {
  const [d, setD] = useState(initial)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [notes, setNotes] = useState('')

  const recent = useLiveQuery(async () => {
    if (initial.id) return []
    const all = await db.foods.orderBy('id').reverse().limit(200).toArray()
    const seen = new Set<string>()
    return all.filter((f) => f.name && !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase())).slice(0, 8)
  })

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value })

  async function estimate(photo: string) {
    setBusy(true)
    setErr('')
    try {
      const g = await analyzeFood(profile.geminiKey, profile.geminiModel, photo, hint.trim())
      setD((cur) => ({
        ...cur,
        name: g.name,
        calories: String(Math.round(g.calories)),
        protein: String(Math.round(g.protein)),
        carbs: String(Math.round(g.carbs)),
        fat: String(Math.round(g.fat)),
        aiEstimated: true,
      }))
      setNotes(g.notes)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const food: Food = {
      ...d,
      name: d.name.trim() || 'Food',
      calories: Math.round(+d.calories || 0),
      protein: Math.round(+d.protein || 0),
      carbs: Math.round(+d.carbs || 0),
      fat: Math.round(+d.fat || 0),
    }
    await db.foods.put(food)
    onClose()
  }

  async function remove() {
    if (d.id !== undefined && confirm('Delete this food?')) {
      await db.foods.delete(d.id)
      onClose()
    }
  }

  return (
    <Modal title={initial.id ? 'Edit food' : 'Add food'} onClose={onClose}>
      {d.photo ? (
        <>
          <Photo src={d.photo} className="photo" />
          <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional: details, e.g. '8 oz chicken, 1 cup rice'" />
          <button className="btn" disabled={busy} onClick={() => estimate(d.photo!)}>
            {busy ? 'Looking at your food…' : d.aiEstimated ? 'Re-estimate from photo' : 'Estimate from photo'}
          </button>
        </>
      ) : (
        <PhotoButton className="btn ghost" onPhoto={async (f) => setD({ ...d, photo: await shrinkImage(f) })}>
          📷 Add a photo
        </PhotoButton>
      )}
      {err && <p className="warn small">{err}</p>}
      {notes && <p className="muted small">Assumed: {notes}</p>}

      {!!recent?.length && !d.name && (
        <div className="chips">
          {recent.map((f) => (
            <button
              key={f.id}
              className="chip"
              onClick={() => setD({ ...d, name: f.name, calories: String(f.calories), protein: String(f.protein), carbs: String(f.carbs), fat: String(f.fat) })}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      <label>
        Name
        <input value={d.name} onChange={set('name')} placeholder="e.g. Chicken burrito bowl" />
      </label>
      <div className="grid4">
        <label>
          Calories
          <input inputMode="numeric" value={d.calories} onChange={set('calories')} />
        </label>
        <label>
          Protein g
          <input inputMode="numeric" value={d.protein} onChange={set('protein')} />
        </label>
        <label>
          Carbs g
          <input inputMode="numeric" value={d.carbs} onChange={set('carbs')} />
        </label>
        <label>
          Fat g
          <input inputMode="numeric" value={d.fat} onChange={set('fat')} />
        </label>
      </div>
      <p className="muted small">Photo estimates can be off. Change any number before saving.</p>
      <div className="row">
        {initial.id !== undefined && (
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
        )}
        <button className="btn" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  )
}
