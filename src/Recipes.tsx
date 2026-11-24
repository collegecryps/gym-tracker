import { useState } from 'react'
import { suggestRecipes, type Macros, type Recipe } from './ai'
import type { Profile } from './db'
import { Modal } from './ui'

const storeKey = (date: string) => `recipes:${date}`

function loadSaved(date: string): Recipe[] {
  try {
    return JSON.parse(localStorage.getItem(storeKey(date)) ?? '[]') as Recipe[]
  } catch {
    return []
  }
}

/** Recipe ideas that fill what's left of the day's targets. The last set is kept for the day, so
 * reopening doesn't spend another free Gemini request. */
export function RecipeSheet({
  profile,
  date,
  left,
  onLog,
  onClose,
}: {
  profile: Profile
  date: string
  left: Macros
  onLog: (r: Recipe) => void
  onClose: () => void
}) {
  const [recipes, setRecipes] = useState<Recipe[]>(() => loadSaved(date))
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const need = {
    calories: Math.max(0, left.calories),
    protein: Math.max(0, left.protein),
    carbs: Math.max(0, left.carbs),
    fat: Math.max(0, left.fat),
  }
  const done = need.calories < 150 && need.protein < 15

  async function find() {
    setBusy(true)
    setErr('')
    try {
      const { recipes: next } = await suggestRecipes(profile.geminiKey, profile.geminiModel, need, request.trim(), recipes.map((r) => r.name))
      setRecipes(next)
      localStorage.setItem(storeKey(date), JSON.stringify(next))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const total = recipes.reduce((t, r) => ({ calories: t.calories + r.calories, protein: t.protein + r.protein }), { calories: 0, protein: 0 })

  return (
    <Modal title="Recipes for your macros" onClose={onClose}>
      <p className="small">
        Still to eat: <strong>{Math.round(need.calories)} cal</strong> · {Math.round(need.protein)}g protein · {Math.round(need.carbs)}g carbs ·{' '}
        {Math.round(need.fat)}g fat
      </p>
      {done ? (
        <p className="muted small">You've hit today's targets. Nothing more needed.</p>
      ) : (
        <>
          <input value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Optional: e.g. 'chicken and rice', 'no fish', 'cheap'" />
          <button className="btn" disabled={busy} onClick={find}>
            {busy ? 'Finding recipes…' : recipes.length ? 'New ideas' : 'Find recipes'}
          </button>
        </>
      )}
      {err && <p className="warn small">{err}</p>}

      {recipes.length > 0 && (
        <p className="muted small">
          These add up to {Math.round(total.calories)} cal and {Math.round(total.protein)}g protein. AI estimates: check labels on
          what you buy, and change the numbers when you log it.
        </p>
      )}
      {recipes.map((r) => (
        <div key={r.name} className="card recipe">
          <div className="row-between">
            <strong>{r.name}</strong>
            <span className="muted small">
              {r.meal} · {Math.round(r.minutes)} min
            </span>
          </div>
          <div className="small">
            {Math.round(r.calories)} cal · {Math.round(r.protein)}p · {Math.round(r.carbs)}c · {Math.round(r.fat)}f
          </div>
          <details>
            <summary className="small">Ingredients and steps</summary>
            <ul className="small">
              {r.ingredients.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
            <ol className="small">
              {r.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </details>
          <button className="btn ghost" onClick={() => onLog(r)}>
            Log this meal
          </button>
        </div>
      ))}
    </Modal>
  )
}
