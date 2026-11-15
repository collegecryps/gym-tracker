import { useState } from 'react'
import { db, type Profile, type Sex } from './db'
import { ACTIVITY } from './plan'

// One question per screen, like Noom's intake quiz.


const PACE = [
  { value: 0.25, label: 'Lean', sub: '0.25% of bodyweight a week. Least fat gain. Best if you have lifted 2+ years.' },
  { value: 0.375, label: 'Balanced', sub: '0.375% a week. A good middle ground for most people.' },
  { value: 0.5, label: 'Fast', sub: '0.5% a week. Best if you are newer to lifting and can grow faster.' },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [age, setAge] = useState('')
  const [ft, setFt] = useState('')
  const [inch, setInch] = useState('')
  const [weight, setWeight] = useState('')
  const [activity, setActivity] = useState(1.375)
  const [pace, setPace] = useState(0.375)

  const steps = [
    {
      q: "What's your name?",
      ok: name.trim().length > 0,
      body: <input className="big-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />,
    },
    {
      q: 'Sex',
      sub: 'Used for the starting calorie estimate.',
      ok: true,
      body: (
        <div className="choices">
          {(['male', 'female'] as const).map((s) => (
            <button key={s} className={`choice ${sex === s ? 'on' : ''}`} onClick={() => setSex(s)}>
              {s === 'male' ? 'Male' : 'Female'}
            </button>
          ))}
        </div>
      ),
    },
    {
      q: 'How old are you?',
      ok: +age >= 13 && +age <= 100,
      body: <input className="big-input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" />,
    },
    {
      q: 'How tall are you?',
      ok: +ft >= 4 && +ft <= 7 && +inch >= 0 && +inch < 12,
      body: (
        <div className="row">
          <input className="big-input" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} placeholder="ft" />
          <input className="big-input" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} placeholder="in" />
        </div>
      ),
    },
    {
      q: 'What do you weigh right now?',
      sub: 'Morning, after the bathroom, before eating is most consistent.',
      ok: +weight >= 80 && +weight <= 500,
      body: <input className="big-input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="lb" />,
    },
    {
      q: 'How active are you outside the gym?',
      sub: "Don't count lifting. The app adds what each workout burns on the day you lift.",
      ok: true,
      body: (
        <div className="choices">
          {ACTIVITY.map((a) => (
            <button key={a.value} className={`choice ${activity === a.value ? 'on' : ''}`} onClick={() => setActivity(a.value)}>
              {a.label}
            </button>
          ))}
        </div>
      ),
    },
    {
      q: 'How fast do you want to gain?',
      sub: 'Gaining slowly keeps you lean. The app checks your real weight trend and adjusts.',
      ok: true,
      body: (
        <div className="choices">
          {PACE.map((p) => (
            <button key={p.value} className={`choice ${pace === p.value ? 'on' : ''}`} onClick={() => setPace(p.value)}>
              <strong>{p.label}</strong>
              <span className="muted small">{p.sub}</span>
            </button>
          ))}
        </div>
      ),
    },
  ]

  const cur = steps[step]
  const last = step === steps.length - 1

  async function finish() {
    const profile: Profile = {
      id: 1,
      name: name.trim(),
      sex,
      age: +age,
      heightIn: +ft * 12 + +inch,
      startWeightLb: +weight,
      activity,
      activityExcludesLifting: true,
      gainPctPerWeek: pace,
      geminiKey: '',
      geminiModel: 'gemini-flash-latest',
    }
    await db.profile.put(profile)
    onDone()
  }

  return (
    <div className="onboarding">
      <div className="progress">
        <div style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>
      <h1>{cur.q}</h1>
      {cur.sub && <p className="muted">{cur.sub}</p>}
      <div className="ob-body">{cur.body}</div>
      <div className="row ob-nav">
        {step > 0 && (
          <button className="btn ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        <button className="btn" disabled={!cur.ok} onClick={() => (last ? finish() : setStep(step + 1))}>
          {last ? 'Build my plan' : 'Next'}
        </button>
      </div>
    </div>
  )
}
