import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type SavedFood } from './db'
import { FOOD_CATEGORIES, MAX_SAVED } from './savedFoods'
import { Modal } from './ui'

/** Every saved food, grouped by type. Tap one to log it again. */
export function SavedFoodsSheet({ onPick, onClose }: { onPick: (f: SavedFood) => void; onClose: () => void }) {
  const saved = useLiveQuery(() => db.savedFoods.orderBy('lastUsed').reverse().toArray(), [])
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(false)
  const shown = (saved ?? []).filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()))
  const groups = FOOD_CATEGORIES.map((c) => [c, shown.filter((f) => (FOOD_CATEGORIES as readonly string[]).includes(f.category) ? f.category === c : c === 'Other')] as const).filter(
    ([, list]) => list.length > 0,
  )

  return (
    <Modal title="Saved foods" onClose={onClose}>
      {saved && saved.length === 0 && <p className="muted center">Foods you log are saved here so you can tap to log them again.</p>}
      {saved && saved.length > 0 && (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved foods" />
          <div className="row-between">
            <span className="muted small">
              {saved.length} of {MAX_SAVED} saved. Your latest {MAX_SAVED} are kept.
            </span>
            <button className="btn ghost small-btn" onClick={() => setEditing(!editing)}>
              {editing ? 'Done' : 'Edit'}
            </button>
          </div>
        </>
      )}
      {groups.map(([category, list]) => (
        <div key={category} className="list">
          <h3>{category}</h3>
          {list.map((f) => (
            <div key={f.id} className="saved-row">
              <button className="list-item grow" onClick={() => onPick(f)}>
                <div className="grow">
                  <div>{f.name}</div>
                  <div className="muted small">
                    {f.protein}p · {f.carbs}c · {f.fat}f
                  </div>
                </div>
                <strong>{f.calories}</strong>
              </button>
              {editing && (
                <button className="icon-btn" aria-label={`Remove ${f.name}`} onClick={() => db.savedFoods.delete(f.id)}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </Modal>
  )
}
