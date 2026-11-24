import Dexie, { type EntityTable } from 'dexie'
import { MAX_SAVED, toSaved } from './foodCategories'

// All data lives on this phone only (IndexedDB). Each person's phone = their own data.

export type Sex = 'male' | 'female'

export interface Profile {
  id: 1
  name: string
  sex: Sex
  age: number
  heightIn: number
  startWeightLb: number
  activity: number // TDEE multiplier, 1.2–1.9
  activityExcludesLifting?: boolean // true once `activity` means life outside the gym (see dailyActivity)
  gainPctPerWeek: number // target bodyweight change, % per week (lean bulk ≈ 0.25–0.5; negative = cutting)
  /** The user's own daily targets. When set, they replace the computed ones and stay the same every day. */
  customTargets?: MacroTargets
  geminiKey: string
  geminiModel: string
}

export interface MacroTargets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface Food {
  id?: number
  date: string // YYYY-MM-DD
  time: number // epoch ms
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  photo?: string // JPEG data URL (Safari can't reliably store Blobs in IndexedDB)
  aiEstimated: boolean
  category?: string // one of FOOD_CATEGORIES (src/savedFoods.ts)
}

/** A food the user has eaten, kept for one-tap logging even if the log entry is deleted. */
export interface SavedFood {
  id: string // lowercase name
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  category: string
  lastUsed: number // epoch ms
}

export interface WeighIn {
  id?: number
  date: string
  weightLb: number
}

export interface LiftSet {
  id?: number
  date: string
  time: number
  exercise: string
  muscle: string
  weightLb: number
  reps: number
  rir?: number // reps in reserve
}

/** A timed lifting session, from Start lift to Finish. */
export interface LiftSession {
  id?: number
  date: string
  start: number // epoch ms
  end?: number // unset while lifting
}

export interface CustomExercise {
  name: string
  muscle: string
  secondary?: string[]
}

/** A workout day template (Push, Pull, Legs, Custom), customized by the user. */
export interface DayTemplate {
  id: string // 'push' | 'pull' | 'legs' | 'custom'
  muscles: { name: string; sets: number }[]
  pinned: Record<string, string[]> // muscle -> preferred exercises, in order
}

/** Which template the user picked for a given day. */
export interface DayPlan {
  date: string
  templateId: string
}

export const db = new Dexie('gym-tracker') as Dexie & {
  profile: EntityTable<Profile, 'id'>
  foods: EntityTable<Food, 'id'>
  weighIns: EntityTable<WeighIn, 'id'>
  sets: EntityTable<LiftSet, 'id'>
  exercises: EntityTable<CustomExercise, 'name'>
  templates: EntityTable<DayTemplate, 'id'>
  dayPlans: EntityTable<DayPlan, 'date'>
  sessions: EntityTable<LiftSession, 'id'>
  savedFoods: EntityTable<SavedFood, 'id'>
}

db.version(1).stores({
  profile: 'id',
  foods: '++id, date',
  weighIns: '++id, &date',
  sets: '++id, date, exercise',
  exercises: 'name',
})

db.version(2).stores({
  templates: 'id',
  dayPlans: 'date',
})

db.version(3).stores({
  sessions: '++id, date',
})

// Saved foods start out as the 40 most recently logged distinct foods.
db.version(4)
  .stores({ savedFoods: 'id, lastUsed' })
  .upgrade(async (tx) => {
    const foods = await tx.table<Food>('foods').toArray()
    const seen = new Map<string, SavedFood>()
    for (const f of foods.sort((a, b) => b.time - a.time)) {
      const s = toSaved(f, f.time)
      if (s.id && s.name !== 'Food' && !seen.has(s.id)) seen.set(s.id, s)
    }
    await tx.table('savedFoods').bulkPut([...seen.values()].slice(0, MAX_SAVED))
  })

export function todayStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return todayStr(d)
}

// Ask Safari to keep our data even when storage is low.
export async function requestPersistence(): Promise<void> {
  if (navigator.storage?.persist) await navigator.storage.persist()
}

// ---------- Backup ----------

export async function exportBackup(): Promise<Blob> {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: await db.profile.get(1),
    foods: await db.foods.toArray(),
    weighIns: await db.weighIns.toArray(),
    sets: await db.sets.toArray(),
    exercises: await db.exercises.toArray(),
    templates: await db.templates.toArray(),
    dayPlans: await db.dayPlans.toArray(),
    sessions: await db.sessions.toArray(),
    savedFoods: await db.savedFoods.toArray(),
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

export async function importBackup(file: File): Promise<void> {
  const data = JSON.parse(await file.text())
  if (data?.version !== 1) throw new Error('Not a backup file from this app')
  const tables = [db.profile, db.foods, db.weighIns, db.sets, db.exercises, db.templates, db.dayPlans, db.sessions, db.savedFoods]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    if (data.profile) await db.profile.put(data.profile)
    await db.foods.bulkPut(data.foods ?? [])
    await db.weighIns.bulkPut(data.weighIns ?? [])
    await db.sets.bulkPut(data.sets ?? [])
    await db.exercises.bulkPut(data.exercises ?? [])
    await db.templates.bulkPut(data.templates ?? [])
    await db.dayPlans.bulkPut(data.dayPlans ?? [])
    await db.sessions.bulkPut(data.sessions ?? [])
    await db.savedFoods.bulkPut(data.savedFoods ?? [])
  })
}
