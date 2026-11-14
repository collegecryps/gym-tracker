import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { analyzeEquipment, shrinkImage, type EquipmentGuess } from './ai'
import { daysAgoStr, db, todayStr, type LiftSet } from './db'
import {
  DEFAULT_EXERCISES,
  MUSCLES,
  VOLUME_MAX,
  VOLUME_MIN,
  e1rm,
  lastSession,
  nextSessionSuggestion,
  nextSetPrefill,
  strengthProgress,
  weightStep,
  workoutsByDay,
  weeklyFrequencyByMuscle,
  weeklySetsByMuscle,
  type ExerciseDef,
} from './plan'
import { plural, prettyDate } from './helpers'
import { LineChart } from './LineChart'
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
  const [sheet, setSheet] = useState<'history' | 'progress' | null>(null)

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

      <div className="row">
        <button className="btn ghost" onClick={() => setSheet('history')}>
          📅 History
        </button>
        <button className="btn ghost" onClick={() => setSheet('progress')}>
          📈 Progress
        </button>
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
      {sheet === 'history' && <HistorySheet onClose={() => setSheet(null)} />}
      {sheet === 'progress' && <ProgressSheet onClose={() => setSheet(null)} />}
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

function addSet(s: Omit<LiftSet, 'id' | 'time'>) {
  return db.sets.add({ ...s, time: Date.now() })
}

const fmt = (s: { weightLb: number; reps: number }) => `${s.weightLb} × ${s.reps}`

function Stepper({ label, value, onChange, step, decimal }: { label: string; value: string; onChange: (v: string) => void; step: number; decimal?: boolean }) {
  const bump = (d: number) => onChange(String(Math.max(0, Math.round(((+value || 0) + d) * 10) / 10)))
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="stepper-row">
        <button onClick={() => bump(-step)} aria-label={`${label} down`}>
          −
        </button>
        <input aria-label={label} inputMode={decimal ? 'decimal' : 'numeric'} value={value} onChange={(e) => onChange(e.target.value)} />
        <button onClick={() => bump(step)} aria-label={`${label} up`}>
          +
        </button>
      </div>
    </div>
  )
}

function ExerciseSheet({ exercise, onClose }: { exercise: ExerciseDef; onClose: () => void }) {
  const today = todayStr()
  const history = useLiveQuery(() => db.sets.where('exercise').equals(exercise.name).sortBy('time'), [exercise.name])
  const todaySets = (history ?? []).filter((s) => s.date === today)
  const last = history ? lastSession(history, today) : null
  const lastSets = last?.sets ?? []
  const suggestion = history ? nextSessionSuggestion(history, today) : null
  const best = (history ?? []).reduce<LiftSet | null>((b, s) => (!b || e1rm(s.weightLb, s.reps) > e1rm(b.weightLb, b.reps) ? s : b), null)

  // Inputs: null = use the suggested prefill for the next set.
  const [weight, setWeight] = useState<string | null>(null)
  const [reps, setReps] = useState<string | null>(null)
  const [rir, setRir] = useState<number | undefined>(2)
  const [editing, setEditing] = useState<LiftSet | null>(null)

  const prefill = nextSetPrefill(lastSets, todaySets)
  const w = weight ?? (prefill ? String(prefill.weightLb) : '')
  const r = reps ?? (prefill ? String(prefill.reps) : '')
  const wStep = weightStep(+w || 0)

  const byDate = new Map<string, LiftSet[]>()
  for (const s of history ?? []) if (s.date !== today) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s])
  const sessions = [...byDate].reverse().slice(0, 6)

  const rows = Math.max(lastSets.length, todaySets.length)

  function resetInputs() {
    setWeight(null)
    setReps(null)
    setEditing(null)
  }

  async function save() {
    if (!(+w >= 0) || !(+r > 0)) return
    if (editing?.id !== undefined) {
      await db.sets.update(editing.id, { weightLb: +w, reps: Math.round(+r), rir })
    } else {
      await addSet({ date: today, exercise: exercise.name, muscle: exercise.muscle, weightLb: +w, reps: Math.round(+r), rir })
    }
    resetInputs()
  }

  function edit(s: LiftSet) {
    setEditing(s)
    setWeight(String(s.weightLb))
    setReps(String(s.reps))
    setRir(s.rir)
  }

  async function remove(s: LiftSet) {
    if (s.id !== undefined) await db.sets.delete(s.id)
    if (editing?.id === s.id) resetInputs()
  }

  return (
    <Modal title={exercise.name} onClose={onClose}>
      <p className="muted small">
        {exercise.muscle}
        {exercise.secondary?.length ? ` · also ${exercise.secondary.join(', ')}` : ''}
      </p>
      {suggestion && <div className="card tip">{suggestion.text}</div>}

      {rows > 0 && (
        <div className="ladder">
          <div className="ladder-head muted small">
            <span>Set</span>
            <span>{last ? prettyDate(last.date) : 'Last time'}</span>
            <span>Today</span>
            <span />
          </div>
          {Array.from({ length: rows }, (_, i) => {
            const prev = lastSets[i]
            const cur = todaySets[i]
            const beat = prev && cur ? Math.sign(e1rm(cur.weightLb, cur.reps) - e1rm(prev.weightLb, prev.reps)) : 0
            return (
              <div key={i} className={`ladder-row ${cur && editing?.id === cur.id ? 'editing' : ''}`}>
                <span className="muted">{i + 1}</span>
                <span className="muted">{prev ? fmt(prev) : '–'}</span>
                {cur ? (
                  <button className="ladder-today" onClick={() => edit(cur)} aria-label={`Edit set ${i + 1}`}>
                    {fmt(cur)}
                    {beat > 0 && <span className="up"> ▲</span>}
                    {beat < 0 && <span className="down"> ▼</span>}
                    {cur.rir !== undefined && <span className="muted small"> · {cur.rir === 4 ? '4+' : cur.rir} left</span>}
                  </button>
                ) : (
                  <span className="muted">–</span>
                )}
                {cur ? (
                  <button className="icon-btn" onClick={() => remove(cur)} aria-label={`Delete set ${i + 1}`}>
                    ✕
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="card">
        <h3>{editing ? `Edit set ${todaySets.findIndex((s) => s.id === editing.id) + 1}` : `Set ${todaySets.length + 1}`}</h3>
        <div className="row">
          <Stepper label="Weight lb" value={w} onChange={setWeight} step={wStep} decimal />
          <Stepper label="Reps" value={r} onChange={setReps} step={1} />
        </div>
        <div className="rir">
          <span>Reps left in the tank</span>
          <div className="seg">
            {RIR_OPTIONS.map((n) => (
              <button key={n} className={rir === n ? 'on' : ''} onClick={() => setRir(n)}>
                {n === 4 ? '4+' : n}
              </button>
            ))}
          </div>
          <span className="muted small">Warm-ups: pick 4+. They won't count toward weekly hard sets.</span>
        </div>
        <div className="row">
          {editing && (
            <button className="btn ghost" onClick={resetInputs}>
              Cancel
            </button>
          )}
          <button className="btn" onClick={save}>
            {editing ? 'Update set' : 'Log set'}
          </button>
        </div>
      </div>

      {best && (
        <p className="muted small">
          Best: {fmt(best)} (est. 1-rep max {Math.round(e1rm(best.weightLb, best.reps))} lb)
        </p>
      )}
      {sessions.length > 0 && (
        <div className="list">
          <h3>History</h3>
          {sessions.map(([date, sets]) => (
            <div key={date} className="list-item">
              <span className="muted small">{prettyDate(date)}</span>
              <div className="grow small">{sets.map((x) => `${x.weightLb}×${x.reps}`).join('  ')}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function HistorySheet({ onClose }: { onClose: () => void }) {
  const [shown, setShown] = useState(20)
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const workouts = workoutsByDay(sets ?? [])

  return (
    <Modal title="Workout history" onClose={onClose}>
      {sets && workouts.length === 0 && <p className="muted center">No workouts logged yet.</p>}
      {workouts.slice(0, shown).map((w) => (
        <details key={w.date} className="card history-day" open={w === workouts[0]}>
          <summary>
            <span>{w.date === todayStr() ? 'Today' : prettyDate(w.date)}</span>
            <span className="muted small">
              {plural(w.exercises.length, 'exercise')} · {plural(w.exercises.reduce((n, e) => n + e.sets.length, 0), 'set')}
            </span>
          </summary>
          {w.exercises.map((e) => (
            <div key={e.name} className="history-ex">
              <div>{e.name}</div>
              <div className="muted small">{e.sets.map((x) => `${x.weightLb}×${x.reps}`).join('  ')}</div>
            </div>
          ))}
        </details>
      ))}
      {workouts.length > shown && (
        <button className="btn ghost" onClick={() => setShown(shown + 20)}>
          Show older
        </button>
      )}
    </Modal>
  )
}

function ProgressSheet({ onClose }: { onClose: () => void }) {
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  // Exercises, most recently trained first
  const names = [...new Map([...(sets ?? [])].sort((a, b) => b.time - a.time).map((s) => [s.exercise, true])).keys()]
  const [picked, setPicked] = useState<string | null>(null)
  const name = picked ?? names[0]
  const points = strengthProgress((sets ?? []).filter((s) => s.exercise === name))
  const change = points.length > 1 ? points[points.length - 1].value - points[0].value : null

  return (
    <Modal title="Progress" onClose={onClose}>
      {sets && names.length === 0 && <p className="muted center">Log some lifts and your progress shows up here.</p>}
      {names.length > 0 && (
        <>
          <select value={name} onChange={(e) => setPicked(e.target.value)} aria-label="Exercise">
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <LineChart title="Estimated 1-rep max" points={points} unit="lb" />
          {change !== null && (
            <p className="small">
              <strong className={change >= 0 ? 'up' : 'down'}>
                {change >= 0 ? '+' : ''}
                {change} lb
              </strong>{' '}
              since {prettyDate(points[0].date)} over {points.length} sessions.
            </p>
          )}
          <p className="muted small">
            Each point is your best set that day, converted to an estimated 1-rep max so heavy low-rep sets and lighter
            high-rep sets compare fairly. Tap the chart to read a session.
          </p>
        </>
      )}
    </Modal>
  )
}
