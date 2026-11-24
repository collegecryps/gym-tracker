import { useState } from 'react'
import { db, exportBackup, importBackup, todayStr, type Profile } from './db'
import { ACTIVITY, dailyActivity } from './plan'
import { PRINCIPLES } from './science'

export function MoreTab({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  // Typed as text so a field can be empty while editing.
  const [own, setOwn] = useState(() => {
    const t = profile.customTargets
    return { on: !!t, calories: String(t?.calories ?? ''), protein: String(t?.protein ?? ''), carbs: String(t?.carbs ?? ''), fat: String(t?.fat ?? '') }
  })
  const ownCalories = (+own.protein || 0) * 4 + (+own.carbs || 0) * 4 + (+own.fat || 0) * 9
  const ownValid = [own.calories, own.protein, own.carbs, own.fat].every((v) => +v >= 0 && v.trim() !== '') && +own.calories > 0

  const num = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setP({ ...p, [k]: +e.target.value })
    setSaved(false)
  }
  const str = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setP({ ...p, [k]: e.target.value.trim() })
    setSaved(false)
  }

  const setOwnField = (k: keyof typeof own) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setOwn({ ...own, [k]: k === 'on' ? e.target.checked : e.target.value })
    setSaved(false)
  }

  async function save() {
    if (own.on && !ownValid) {
      setSaveErr('Fill in all four targets, or turn off "Use my own targets".')
      return
    }
    const customTargets = own.on
      ? { calories: Math.round(+own.calories), protein: Math.round(+own.protein), carbs: Math.round(+own.carbs), fat: Math.round(+own.fat) }
      : undefined
    const next = { ...p, customTargets }
    if (!customTargets) delete next.customTargets
    await db.profile.put(next)
    setP(next)
    setSaveErr('')
    setSaved(true)
  }

  async function backup() {
    const blob = await exportBackup()
    const file = new File([blob], `gym-tracker-${p.name.toLowerCase()}-${todayStr()}.json`, { type: 'application/json' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] }).catch(() => {})
    } else {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(file)
      a.download = file.name
      a.click()
      URL.revokeObjectURL(a.href)
    }
  }

  async function restore(f: File) {
    if (!confirm('Replace everything on this phone with this backup?')) return
    try {
      await importBackup(f)
      setMsg('Backup restored.')
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="page">
      <h1>More</h1>

      <div className="card">
        <h3>Photo recognition (free)</h3>
        <ol className="small steps">
          <li>
            Open{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com/apikey
            </a>{' '}
            and sign in with Google.
          </li>
          <li>Tap “Create API key”, then copy it.</li>
          <li>Paste it below and tap Save.</li>
        </ol>
        <p className="muted small">Free, no card needed. The key stays on this phone only. Google limits free photos per day; you can always type numbers in by hand.</p>
        <label>
          Gemini API key
          <input type="password" value={p.geminiKey} onChange={str('geminiKey')} placeholder="Paste key" autoComplete="off" />
        </label>
        <label>
          Model
          <input value={p.geminiModel} onChange={str('geminiModel')} />
        </label>
      </div>

      <div className="card">
        <h3>Your plan</h3>
        <div className="grid3">
          <label>
            Age
            <input inputMode="numeric" value={p.age} onChange={num('age')} />
          </label>
          <label>
            Height in
            <input inputMode="numeric" value={p.heightIn} onChange={num('heightIn')} />
          </label>
          <label>
            Start lb
            <input inputMode="decimal" value={p.startWeightLb} onChange={num('startWeightLb')} />
          </label>
        </div>
        <label>
          Activity outside the gym
          <select
            value={dailyActivity(p)}
            onChange={(e) => {
              setP({ ...p, activity: +e.target.value, activityExcludesLifting: true })
              setSaved(false)
            }}
          >
            {ACTIVITY.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Goal
          <select value={p.gainPctPerWeek} onChange={num('gainPctPerWeek')}>
            <option value={0.25}>Lean bulk: gain 0.25% of bodyweight a week</option>
            <option value={0.375}>Bulk: gain 0.375% a week</option>
            <option value={0.5}>Fast bulk: gain 0.5% a week</option>
            <option value={-0.25}>Slow cut: lose 0.25% a week (~{((p.startWeightLb * 0.25) / 100).toFixed(1)} lb)</option>
            <option value={-0.5}>Cut: lose 0.5% a week (~{((p.startWeightLb * 0.5) / 100).toFixed(1)} lb)</option>
            <option value={-0.75}>Fast cut: lose 0.75% a week (~{((p.startWeightLb * 0.75) / 100).toFixed(1)} lb)</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3>Daily food targets</h3>
        <label className="check">
          <input type="checkbox" checked={own.on} onChange={setOwnField('on')} />
          Use my own targets
        </label>
        {own.on ? (
          <>
            <div className="grid4">
              <label>
                Calories
                <input inputMode="numeric" value={own.calories} onChange={setOwnField('calories')} />
              </label>
              <label>
                Protein g
                <input inputMode="numeric" value={own.protein} onChange={setOwnField('protein')} />
              </label>
              <label>
                Carbs g
                <input inputMode="numeric" value={own.carbs} onChange={setOwnField('carbs')} />
              </label>
              <label>
                Fat g
                <input inputMode="numeric" value={own.fat} onChange={setOwnField('fat')} />
              </label>
            </div>
            <p className="muted small">
              Same targets every day, lifting days included. Your protein, carbs and fat add up to {ownCalories} cal.
              {ownValid && Math.abs(ownCalories - +own.calories) > 100 && <span className="warn"> That's off from your calorie target by {Math.abs(Math.round(ownCalories - +own.calories))}.</span>}
            </p>
          </>
        ) : (
          <p className="muted small">The app works out your targets from your goal and weight trend. Turn this on to type in your own.</p>
        )}
      </div>

      <button className="btn" onClick={save}>
        {saved ? 'Saved ✓' : 'Save'}
      </button>
      {saveErr && <p className="warn small">{saveErr}</p>}

      <div className="card">
        <h3>Backup</h3>
        <p className="muted small">Your data lives only on this phone. Save a backup to Files or iCloud every week or two.</p>
        <div className="row">
          <button className="btn ghost" onClick={backup}>
            Save backup
          </button>
          <label className="btn ghost file-btn">
            Restore
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) restore(f)
              }}
            />
          </label>
        </div>
        {msg && <p className="small">{msg}</p>}
      </div>

      <div className="card">
        <h3>The science behind the app</h3>
        {PRINCIPLES.map((pr) => (
          <details key={pr.rule}>
            <summary>{pr.rule}</summary>
            <p className="small">{pr.detail}</p>
            <ul className="small">
              {pr.sources.map((s) => (
                <li key={s.cite}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.cite}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      <p className="muted small center">
        App version {new Date(__BUILD_DATE__).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </p>
    </div>
  )
}