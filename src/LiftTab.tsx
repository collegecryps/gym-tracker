import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { analyzeEquipment, shrinkImage, type EquipmentGuess } from './ai'
import { daysAgoStr, db, todayStr, type LiftSet } from './db'
import {
  DEFAULT_EXERCISES,
  MUSCLES,
  REP_MAX,
  REP_MIN,
  VOLUME_MAX,
  VOLUME_MIN,
  e1rm,
  nextSessionSuggestion,
  weeklyFrequencyByMuscle,
  weeklySetsByMuscle,
  type ExerciseDef,
} from './plan'
import { prettyDate } from './helpers'
import { Photo, Modal, PhotoButton } from './ui'

function useLibrary(): { list: ExerciseDef[]; lookup: (name: string) => ExerciseDef | undefined } {
  const custom = useLiveQuery(() => db.exercises.toArray(), [])
  return useMemo(() => {
    const map = new Map<string, ExerciseDef>()
    for (const e of DEFAULT_EXERCISES) map.set(e.name.toLowerCase(), e)
    for (const e of custom ?? []) map.set(e.name.toLowerCase(), e)
    const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
    return { list, lookup: (n: string) => map.get(n.toLowerCase()) }
  }, [custom])
}

export function LiftTab() {
  const today = todayStr()
  const lib = useLibrary()
  const [open, setOpen] = useState<ExerciseDef | null>(null)
  const [picking, setPicking] = useState(false)
  const [scan, setScan] = useState<string | null>(null)

  const weekSets = useLiveQuery(() => db.sets.where('date').aboveOrEqual(daysAgoStr(7)).toArray(), [])
  const todaySets = (weekSets ?? []).filter((s) => s.date === today)
  const todayExercises = [...new Set(todaySets.map((s) => s.exercise))]

  const volume = weeklySetsByMuscle(weekSets ?? [], lib.lookup)
  const freq = weeklyFrequencyByMuscle(weekSets ?? [])

  return (
    <div className="page">
      <h1>Lift</h1>

      <div className="row">
        <button className="btn" onClick={() => setPicking(true)}>
          + Add exercise
        </button>
        <PhotoButton className="btn ghost" onPhoto={async (f) => setScan(await shrinkImage(f, 768))}>
          📷 Scan machine
        </PhotoButton>
      </div>

      {todayExercises.length > 0 && (
        <div className="list">
          <h3>Today</h3>
          {todayExercises.map((name) => {
            const s = todaySets.filter((x) => x.exercise === name)
            return (
              <button key={name} className="list-item" onClick={() => setOpen(lib.lookup(name) ?? { name, muscle: s[0].muscle })}>
                <div className="grow">
                  <div>{name}</div>
                  <div className="muted small">{s.map((x) => `${x.weightLb}×${x.reps}`).join('  ')}</div>
                </div>
                <span className="muted">{s.length} sets</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="card">
        <h3>Hard sets this week</h3>
        <p className="muted small">
          Target {VOLUME_MIN}–{VOLUME_MAX} per muscle, trained on 2+ days (the “d” column). Helper muscles on compound lifts count half.
        </p>
        {MUSCLES.map((m) => {
          const v = volume.get(m) ?? 0
          const f = freq.get(m) ?? 0
          const status = v < VOLUME_MIN ? 'low' : v > VOLUME_MAX ? 'high' : 'good'
          return (
            <div key={m} className="vol-row">
              <span className="vol-name">{m}</span>
              <div className="vol-track">
                <div className="vol-zone" style={{ left: `${(VOLUME_MIN / 25) * 100}%`, width: `${((VOLUME_MAX - VOLUME_MIN) / 25) * 100}%` }} />
                <div className={`vol-fill ${status}`} style={{ width: `${Math.min(100, (v / 25) * 100)}%` }} />
              </div>
              <span className={`vol-num ${status}`}>{Number.isInteger(v) ? v : v.toFixed(1)}</span>
              <span className={`muted small vol-freq ${f === 1 ? 'warn' : ''}`}>{f > 0 ? `${f}d` : ''}</span>
            </div>
          )
        })}
      </div>

      {picking && (
        <ExercisePicker
          list={lib.list}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setPicking(false)
            setOpen(e)
          }}
        />
      )}
      {scan && (
        <ScanSheet
          photo={scan}
          onClose={() => setScan(null)}
          onPick={(e) => {
            setScan(null)
            setOpen(e)
          }}
        />
      )}
      {open && <ExerciseSheet exercise={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ExercisePicker({ list, onPick, onClose }: { list: ExerciseDef[]; onPick: (e: ExerciseDef) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState(MUSCLES[0] as string)
  const matches = list.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
  const exact = list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase())

  async function addCustom() {
    const e: ExerciseDef = { name: q.trim(), muscle }
    await db.exercises.put(e)
    onPick(e)
  }

  return (
    <Modal title="Pick an exercise" onClose={onClose}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a new one" />
      {q.trim() && !exact && (
        <div className="card">
          <p className="small">Add “{q.trim()}” as a new exercise. Main muscle:</p>
          <select value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            {MUSCLES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button className="btn" onClick={addCustom}>
            Add
          </button>
        </div>
      )}
      <div className="list">
        {matches.map((e) => (
          <button key={e.name} className="list-item" onClick={() => onPick(e)}>
            <div className="grow">{e.name}</div>
            <span className="muted small">{e.muscle}</span>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function ScanSheet({ photo, onPick, onClose }: { photo: string; onPick: (e: ExerciseDef) => void; onClose: () => void }) {
  const profile = useLiveQuery(() => db.profile.get(1))
  const [guess, setGuess] = useState<EquipmentGuess | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function run() {
    if (!profile) return
    setBusy(true)
    setErr('')
    try {
      setGuess(await analyzeEquipment(profile.geminiKey, profile.geminiModel, photo, MUSCLES))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function pick(x: EquipmentGuess['exercises'][number]) {
    const known = DEFAULT_EXERCISES.find((d) => d.name.toLowerCase() === x.name.toLowerCase())
    const def: ExerciseDef = known ?? { name: x.name, muscle: x.muscle, secondary: x.secondary.filter((m) => m !== x.muscle) }
    if (!known) await db.exercises.put(def)
    onPick(def)
  }

  return (
    <Modal title="Scan machine" onClose={onClose}>
      <Photo src={photo} className="photo" />
      {!guess && (
        <button className="btn" disabled={busy || !profile} onClick={run}>
          {busy ? 'Identifying…' : 'What is this?'}
        </button>
      )}
      {err && <p className="warn small">{err}</p>}
      {guess && (
        <>
          <h3>{guess.equipment}</h3>
          <div className="list">
            {guess.exercises.map((x) => (
              <button key={x.name} className="list-item" onClick={() => pick(x)}>
                <div className="grow">
                  <div>{x.name}</div>
                  <div className="muted small">{x.cue}</div>
                </div>
                <span className="muted small">{x.muscle}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}

const RIR_OPTIONS = [0, 1, 2, 3, 4]

function ExerciseSheet({ exercise, onClose }: { exercise: ExerciseDef; onClose: () => void }) {
  const today = todayStr()
  const history = useLiveQuery(() => db.sets.where('exercise').equals(exercise.name).sortBy('time'), [exercise.name])
  const todaySets = (history ?? []).filter((s) => s.date === today)
  const lastSet = history?.[history.length - 1]
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState<number | undefined>(2)

  const suggestion = history ? nextSessionSuggestion(history, today) : null
  const best = (history ?? []).reduce<LiftSet | null>((b, s) => (!b || e1rm(s.weightLb, s.reps) > e1rm(b.weightLb, b.reps) ? s : b), null)

  const byDate = new Map<string, LiftSet[]>()
  for (const s of history ?? []) if (s.date !== today) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s])
  const sessions = [...byDate].reverse().slice(0, 6)

  const w = weight || (lastSet ? String(lastSet.weightLb) : '')
  const r = reps || (lastSet ? String(lastSet.reps) : '')

  async function log() {
    if (!(+w >= 0) || !(+r > 0)) return
    await db.sets.add({
      date: today,
      time: Date.now(),
      exercise: exercise.name,
      muscle: exercise.muscle,
      weightLb: +w,
      reps: Math.round(+r),
      rir,
    })
    setWeight(w)
    setReps(r)
  }

  return (
    <Modal title={exercise.name} onClose={onClose}>
      <p className="muted small">
        {exercise.muscle}
        {exercise.secondary?.length ? ` · also ${exercise.secondary.join(', ')}` : ''} · aim for {REP_MIN}–{REP_MAX} reps
      </p>
      {suggestion && <div className="card tip">{suggestion.text}</div>}

      <div className="grid3">
        <label>
          Weight lb
          <input inputMode="decimal" value={w} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label>
          Reps
          <input inputMode="numeric" value={r} onChange={(e) => setReps(e.target.value)} />
        </label>
        <div className="rir">
          <span>Reps left</span>
          <div className="seg">
            {RIR_OPTIONS.map((n) => (
              <button key={n} className={rir === n ? 'on' : ''} onClick={() => setRir(n)}>
                {n === 4 ? '4+' : n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className="btn" onClick={log}>
        Log set
      </button>

      {todaySets.length > 0 && (
        <div className="list">
          {todaySets.map((s, i) => (
            <div key={s.id} className="list-item">
              <span className="muted">Set {i + 1}</span>
              <div className="grow">
                {s.weightLb} lb × {s.reps}
                {s.rir !== undefined ? ` · ${s.rir === 4 ? '4+' : s.rir} left` : ''}
              </div>
              <button className="icon-btn" onClick={() => s.id !== undefined && db.sets.delete(s.id)} aria-label="Delete set">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {best && (
        <p className="muted small">
          Best: {best.weightLb} × {best.reps} (est. 1-rep max {Math.round(e1rm(best.weightLb, best.reps))} lb)
        </p>
      )}
      {sessions.length > 0 && (
        <div className="list">
          <h3>History</h3>
          {sessions.map(([date, sets]) => (
            <div key={date} className="list-item">
              <span className="muted small">{prettyDate(date)}</span>
              <div className="grow small">{sets.map((s) => `${s.weightLb}×${s.reps}`).join('  ')}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
