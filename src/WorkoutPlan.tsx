import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { daysAgoStr, db, todayStr, type DayTemplate, type LiftSet } from './db'
import { MUSCLES, type ExerciseDef } from './plan'
import { DAY_NAMES, DEFAULT_SETS, DEFAULT_TEMPLATES, buildWorkout, rankExercises, templateFor, type PlannedExercise } from './program'
import { Modal } from './ui'

interface Library {
  list: ExerciseDef[]
  lookup: (name: string) => ExerciseDef | undefined
}

/** Today's workout: pick Push / Pull / Legs / Custom, get an optimized plan, tap an exercise to log it. */
export function TodayPlan({ lib, onOpen }: { lib: Library; onOpen: (e: ExerciseDef) => void }) {
  const today = todayStr()
  const plan = useLiveQuery(() => db.dayPlans.get(today), [today])
  const saved = useLiveQuery(() => db.templates.toArray(), [])
  const history = useLiveQuery(() => db.sets.toArray(), [])
  const [editing, setEditing] = useState<DayTemplate | null>(null)
  const [swap, setSwap] = useState<{ template: DayTemplate; item: PlannedExercise; shown: string[] } | null>(null)

  if (plan === undefined && saved === undefined) return null

  async function pick(id: string) {
    await db.dayPlans.put({ date: today, templateId: id })
    const t = templateFor(id, saved ?? [])
    if (!t.muscles.length) setEditing(t)
  }

  if (!plan) {
    return (
      <div className="card">
        <h3>What are you hitting today?</h3>
        <div className="day-pick">
          {['push', 'pull', 'legs', 'custom'].map((id) => (
            <button key={id} className="btn ghost" onClick={() => pick(id)}>
              {DAY_NAMES[id]}
            </button>
          ))}
        </div>
      </div>
    )
  }

  const template = templateFor(plan.templateId, saved ?? [])
  const workout = buildWorkout({
    template,
    library: lib.list,
    history: history ?? [],
    today,
    weekStart: daysAgoStr(6),
    lookup: lib.lookup,
  })
  const planned = workout.reduce((n, m) => n + m.exercises.reduce((k, e) => k + e.sets, 0), 0)
  const done = workout.reduce((n, m) => n + m.exercises.reduce((k, e) => k + Math.min(e.doneToday, e.sets), 0), 0)

  return (
    <div className="card plan">
      <div className="plan-head">
        <h3>{DAY_NAMES[template.id]} day</h3>
        <span className="muted small">
          {done}/{planned} sets
        </span>
      </div>
      <div className="row">
        <button className="btn ghost small-btn" onClick={() => setEditing(template)}>
          Customize
        </button>
        <button className="btn ghost small-btn" onClick={() => db.dayPlans.delete(today)}>
          Change day
        </button>
      </div>

      {workout.length === 0 && <p className="muted small">No muscles picked yet. Tap Customize.</p>}
      {workout.map((m) => (
        <div key={m.muscle} className="plan-muscle">
          <div className="plan-muscle-head">
            <strong>{m.muscle}</strong>
            <span className="muted small">
              {m.weekSoFar} this week → {m.weekSoFar + m.sets} after today
            </span>
          </div>
          {m.note && <p className="warn small">{m.note}</p>}
          {m.exercises.map((e) => (
            <div key={e.exercise.name} className={`plan-ex ${e.doneToday >= e.sets ? 'done' : ''}`}>
              <button className="grow plan-ex-main" onClick={() => onOpen(e.exercise)}>
                <div>
                  {e.doneToday >= e.sets ? '✓ ' : ''}
                  {e.exercise.name}
                </div>
                <div className="muted small">
                  {e.scheme === 'pyramid' ? `Pyramid: warm up, then ${e.sets} working sets climbing to a ${e.reps} reps` : `${e.sets} sets × ${e.reps} reps`}
                  {' · '}
                  {e.doneToday}/{e.sets} done
                </div>
                {e.target && <div className="small plan-target">{e.target}</div>}
              </button>
              <button
                className="icon-btn"
                aria-label={`Swap ${e.exercise.name}`}
                onClick={() => setSwap({ template, item: e, shown: m.exercises.map((x) => x.exercise.name) })}
              >
                ⇄
              </button>
            </div>
          ))}
        </div>
      ))}

      {editing && <TemplateEditor template={editing} onClose={() => setEditing(null)} />}
      {swap && (
        <SwapSheet
          {...swap}
          library={lib.list}
          history={history ?? []}
          onClose={() => setSwap(null)}
        />
      )}
    </div>
  )
}

function TemplateEditor({ template, onClose }: { template: DayTemplate; onClose: () => void }) {
  const [muscles, setMuscles] = useState(template.muscles)
  const has = (m: string) => muscles.some((x) => x.name === m)
  const toggle = (m: string) =>
    setMuscles(has(m) ? muscles.filter((x) => x.name !== m) : [...muscles, { name: m, sets: DEFAULT_SETS[m] ?? 4 }])
  const bump = (m: string, d: number) =>
    setMuscles(muscles.map((x) => (x.name === m ? { ...x, sets: Math.min(12, Math.max(1, x.sets + d)) } : x)))
  const def = DEFAULT_TEMPLATES.find((t) => t.id === template.id)

  async function save() {
    await db.templates.put({ ...template, muscles })
    onClose()
  }

  return (
    <Modal title={`Customize ${DAY_NAMES[template.id]} day`} onClose={onClose}>
      <p className="muted small">Pick the muscles you're hitting. The app picks exercises and adjusts sets to what you've already done this week.</p>
      <div className="chips">
        {MUSCLES.map((m) => (
          <button key={m} className={`chip ${has(m) ? 'on' : ''}`} onClick={() => toggle(m)} aria-pressed={has(m)}>
            {m}
          </button>
        ))}
      </div>
      {muscles.map((m) => (
        <div key={m.name} className="list-item">
          <span className="grow">{m.name}</span>
          <button className="icon-btn" onClick={() => bump(m.name, -1)} aria-label={`${m.name} fewer sets`}>
            −
          </button>
          <span className="sets-count">{m.sets} sets</span>
          <button className="icon-btn" onClick={() => bump(m.name, 1)} aria-label={`${m.name} more sets`}>
            +
          </button>
        </div>
      ))}
      <p className="muted small">Muscles go in the order you pick them, so pick your priority first while you're fresh.</p>
      <div className="row">
        {def && def.muscles.length > 0 && (
          <button className="btn ghost" onClick={() => setMuscles(def.muscles)}>
            Reset
          </button>
        )}
        <button className="btn" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  )
}

function SwapSheet({
  template,
  item,
  shown,
  library,
  history,
  onClose,
}: {
  template: DayTemplate
  item: PlannedExercise
  shown: string[]
  library: ExerciseDef[]
  history: LiftSet[]
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const options = rankExercises(item.muscle, library, history)
    .filter((e) => !shown.includes(e.name))
    .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
  const typed = q.trim()
  const known = library.find((e) => e.name.toLowerCase() === typed.toLowerCase())

  /** Save a lift that isn't in the list yet, so it shows up everywhere from now on. */
  async function addNew() {
    if (!typed) return
    if (!known) await db.exercises.put({ name: typed, muscle: item.muscle })
    await choose(known?.name ?? typed)
  }

  async function choose(name: string) {
    const pinned = shown.map((n) => (n === item.exercise.name ? name : n))
    await db.templates.put({ ...template, pinned: { ...template.pinned, [item.muscle]: pinned } })
    onClose()
  }

  return (
    <Modal title={`Swap ${item.exercise.name}`} onClose={onClose}>
      <p className="muted small">The app will remember this choice for your {DAY_NAMES[template.id]} days.</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addNew()}
        placeholder="Search or type a new one"
      />
      {typed && !options.some((e) => e.name.toLowerCase() === typed.toLowerCase()) && (
        <button className="btn" onClick={addNew}>
          {known ? `Use “${known.name}”` : `Add “${typed}” (${item.muscle}) and use it`}
        </button>
      )}
      <div className="list">
        {options.map((e) => (
          <button key={e.name} className="list-item" onClick={() => choose(e.name)}>
            <span className="grow">{e.name}</span>
            {e.secondary?.length ? <span className="muted small">compound</span> : null}
          </button>
        ))}
      </div>
    </Modal>
  )
}
