import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { analyzeEquipment, shrinkImage, type EquipmentGuess } from './ai'
import { daysAgoStr, db, todayStr, type LiftSession, type LiftSet, type Profile } from './db'
import {
  DEFAULT_EXERCISES,
  MUSCLES,
  VOLUME_MAX,
  HARD_SET_MAX_RIR,
  VOLUME_MIN,
  e1rm,
  dayLift,
  guessMuscle,
  liftSession,
  type LiftEstimate,
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
import { plural, prettyDate, useTargets } from './helpers'
import { LineChart } from './LineChart'
import { TodayPlan } from './WorkoutPlan'
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

export function LiftTab({ profile }: { profile: Profile }) {
  const today = todayStr()
  const targets = useTargets(profile)
  const sessions = useLiveQuery(() => db.sessions.where('date').equals(today).toArray(), [today])
  const running = sessions?.find((x) => !x.end)
  const now = useNow(running ? 1000 : 30000)
  const lib = useLibrary()
  const [open, setOpen] = useState<ExerciseDef | null>(null)
  const [picking, setPicking] = useState(false)
  const [scan, setScan] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'history' | 'progress' | null>(null)

  const weekSets = useLiveQuery(() => db.sets.where('date').aboveOrEqual(daysAgoStr(7)).toArray(), [])
  const todaySets = (weekSets ?? []).filter((s) => s.date === today)
  const todayExercises = [...new Set(todaySets.map((s) => s.exercise))]

  const weight = targets?.currentWeight
  const estimate = weight ? dayLift(todaySets, weight, sessions ?? [], now) : null
  const exerciseCal = new Map(estimate?.byExercise.map((e) => [e.name, e.calories]))
  const runningSets = running ? todaySets.filter((x) => x.time >= running.start) : []
  const runningEstimate = running && weight ? liftSession(runningSets, weight, running, now) : null

  const volume = weeklySetsByMuscle(weekSets ?? [], lib.lookup)
  const freq = weeklyFrequencyByMuscle(weekSets ?? [])

  return (
    <div className="page">
      <h1>Lift</h1>

      <SessionCard running={running} runningEstimate={runningEstimate} runningSets={runningSets.length} today={estimate} now={now} />

      <TodayPlan lib={lib} onOpen={setOpen} />

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
                <span className="muted small right">
                  {plural(s.length, 'set')}
                  {exerciseCal.has(name) && <div>~{exerciseCal.get(name)} cal</div>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="card">
        <h3>Hard sets, last 7 days</h3>
        <p className="muted small">
          A hard set is a working set you take close to failure, with {HARD_SET_MAX_RIR} or fewer reps left in the tank. Warm-ups
          don't count. Aim for {VOLUME_MIN}–{VOLUME_MAX} per muscle, spread over 2 or more days. When a muscle only helps (triceps
          on bench press), the set counts as half.
        </p>
        {MUSCLES.map((m) => {
          const v = volume.get(m) ?? 0
          const f = freq.get(m) ?? 0
          const status = v < VOLUME_MIN ? 'low' : v > VOLUME_MAX ? 'high' : 'good'
          const need = Math.ceil(VOLUME_MIN - v)
          const label =
            v === 0 ? 'Not trained yet' : status === 'low' ? `${need} more to go` : status === 'good' ? 'In range' : 'Above range, extra sets add little'
          const days = f === 0 ? '' : f === 1 ? '1 day, aim for 2' : `${f} days`
          return (
            <div key={m} className="vol-row">
              <div className="vol-head">
                <span className="vol-name">{m}</span>
                <span className="muted small grow">
                  {label}
                  {days && <span className={f === 1 ? 'warn' : ''}> · {days}</span>}
                </span>
                <span>
                  <span className={`vol-num ${status}`}>{Number.isInteger(v) ? v : v.toFixed(1)}</span>
                  <span className="muted small"> / {VOLUME_MIN}–{VOLUME_MAX}</span>
                </span>
              </div>
              <div className="vol-track">
                <div className="vol-zone" style={{ left: `${(VOLUME_MIN / 25) * 100}%`, width: `${((VOLUME_MAX - VOLUME_MIN) / 25) * 100}%` }} />
                <div className={`vol-fill ${status}`} style={{ width: `${Math.min(100, (v / 25) * 100)}%` }} />
              </div>
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
      {sheet === 'history' && <HistorySheet weightLb={weight} onClose={() => setSheet(null)} />}
      {sheet === 'progress' && <ProgressSheet onClose={() => setSheet(null)} />}
    </div>
  )
}

function ExercisePicker({ list, onPick, onClose }: { list: ExerciseDef[]; onPick: (e: ExerciseDef) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  // null = use the guess from the typed name
  const [picked, setPicked] = useState<string | null>(null)
  const muscle = picked ?? guessMuscle(q)
  const matches = list.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
  const exact = list.some((e) => e.name.toLowerCase() === q.trim().toLowerCase())

  async function addCustom() {
    if (!q.trim()) return
    const e: ExerciseDef = { name: q.trim(), muscle }
    await db.exercises.put(e)
    onPick(e)
  }

  return (
    <Modal title="Pick an exercise" onClose={onClose}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !exact && addCustom()}
        placeholder="Search or type a new one"
      />
      {q.trim() && !exact && (
        <div className="card">
          <p className="small">“{q.trim()}” isn't on the list. Add it and it's saved for next time. Main muscle:</p>
          <select value={muscle} onChange={(e) => setPicked(e.target.value)} aria-label="Main muscle">
            {MUSCLES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button className="btn" onClick={addCustom}>
            Add and log it
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

/** Current time, refreshed every `ms`. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

function clock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  const sec = String(t % 60).padStart(2, '0')
  return h ? `${h}:${m}:${sec}` : `${Math.floor(t / 60)}:${sec}`
}

function SessionCard({
  running,
  runningEstimate,
  runningSets,
  today,
  now,
}: {
  running: LiftSession | undefined
  runningEstimate: LiftEstimate | null
  runningSets: number
  today: LiftEstimate | null
  now: number
}) {
  const start = () => db.sessions.add({ date: todayStr(), start: Date.now() })
  const end = () => running?.id !== undefined && db.sessions.update(running.id, { end: Date.now() })
  const cancel = () => running?.id !== undefined && db.sessions.delete(running.id)

  if (running) {
    return (
      <div className="card session">
        <div className="big-number">
          <strong className="session-clock">{clock(now - running.start)}</strong>
          <span className="muted">{runningEstimate ? `~${runningEstimate.calories} cal this lift` : 'lifting'}</span>
        </div>
        <button className="btn" onClick={end}>
          ■ End lift
        </button>
        {runningSets === 0 && (
          <button className="btn ghost" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
    )
  }
  return (
    <div className="card session">
      <button className="btn" onClick={start}>
        ▶ Start lift
      </button>
      {today && today.calories > 0 ? (
        <p className="muted small">
          Today: {today.minutes} min of lifting, ~{today.calories} cal burned. Saved in History and added to today's food target.
        </p>
      ) : (
        <p className="muted small">Logging your first set starts the timer too. Calories burned are added to today's food target.</p>
      )}
    </div>
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

/** Log a set. Starts the lift timer if none is running, unless a lift ended in the last
 * 15 minutes (then it's a set added after ending, and counts on its own). */
function addSet(s: Omit<LiftSet, 'id' | 'time'>) {
  const time = Date.now()
  return db.transaction('rw', db.sets, db.sessions, async () => {
    const day = await db.sessions.where('date').equals(s.date).toArray()
    const busy = day.some((x) => !x.end || time - x.end < 15 * 60000)
    if (!busy) await db.sessions.add({ date: s.date, start: time - 2 * 60000 })
    await db.sets.add({ ...s, time })
  })
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

function HistorySheet({ weightLb, onClose }: { weightLb: number | undefined; onClose: () => void }) {
  const [shown, setShown] = useState(20)
  const sets = useLiveQuery(() => db.sets.toArray(), [])
  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const workouts = workoutsByDay(sets ?? [])
  const burn = (date: string, daySets: LiftSet[]) =>
    weightLb ? dayLift(daySets, weightLb, (sessions ?? []).filter((x) => x.date === date)) : null

  return (
    <Modal title="Workout history" onClose={onClose}>
      {sets && workouts.length === 0 && <p className="muted center">No workouts logged yet.</p>}
      {workouts.slice(0, shown).map((w) => {
        const b = burn(w.date, w.exercises.flatMap((e) => e.sets))
        const cal = new Map(b?.byExercise.map((e) => [e.name, e.calories]))
        return (
          <details key={w.date} className="card history-day" open={w === workouts[0]}>
            <summary>
              <span>{w.date === todayStr() ? 'Today' : prettyDate(w.date)}</span>
              <span className="muted small">
                {plural(w.exercises.length, 'exercise')} · {plural(w.exercises.reduce((n, e) => n + e.sets.length, 0), 'set')}
                {b && ` · ${b.minutes} min · ~${b.calories} cal`}
              </span>
            </summary>
            {w.exercises.map((e) => (
              <div key={e.name} className="history-ex">
                <div className="row-between">
                  <span>{e.name}</span>
                  {cal.has(e.name) && <span className="muted small">~{cal.get(e.name)} cal</span>}
                </div>
                <div className="muted small">{e.sets.map((x) => `${x.weightLb}×${x.reps}`).join('  ')}</div>
              </div>
            ))}
          </details>
        )
      })}
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
