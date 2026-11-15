import { useState } from 'react'
import { db, exportBackup, importBackup, todayStr, type Profile } from './db'
import { ACTIVITY, dailyActivity } from './plan'
import { PRINCIPLES } from './science'

export function MoreTab({ profile }: { profile: Profile }) {
  const [p, setP] = useState(profile)
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')

  const num = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setP({ ...p, [k]: +e.target.value })
    setSaved(false)
  }
  const str = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setP({ ...p, [k]: e.target.value.trim() })
    setSaved(false)
  }

  async function save() {
    await db.profile.put(p)
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
          Gain pace
          <select value={p.gainPctPerWeek} onChange={num('gainPctPerWeek')}>
            <option value={0.25}>Lean: 0.25% of bodyweight a week</option>
            <option value={0.375}>Balanced: 0.375% a week</option>
            <option value={0.5}>Fast: 0.5% a week</option>
          </select>
        </label>
      </div>

      <button className="btn" onClick={save}>
        {saved ? 'Saved ✓' : 'Save'}
      </button>

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