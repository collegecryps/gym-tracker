import Dexie, { type EntityTable } from 'dexie'

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
  gainPctPerWeek: number // target bodyweight gain, % per week (lean bulk ≈ 0.25–0.5)
  geminiKey: string
  geminiModel: string
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

export interface CustomExercise {
  name: string
  muscle: string
  secondary?: string[]
}

export const db = new Dexie('gym-tracker') as Dexie & {
  profile: EntityTable<Profile, 'id'>
  foods: EntityTable<Food, 'id'>
  weighIns: EntityTable<WeighIn, 'id'>
  sets: EntityTable<LiftSet, 'id'>
  exercises: EntityTable<CustomExercise, 'name'>
}

db.version(1).stores({
  profile: 'id',
  foods: '++id, date',
  weighIns: '++id, &date',
  sets: '++id, date, exercise',
  exercises: 'name',
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
  }
  return new Blob([JSON.stringify(data)], { type: 'application/json' })
}

export async function importBackup(file: File): Promise<void> {
  const data = JSON.parse(await file.text())
  if (data?.version !== 1) throw new Error('Not a backup file from this app')
  await db.transaction('rw', [db.profile, db.foods, db.weighIns, db.sets, db.exercises], async () => {
    await Promise.all([db.profile.clear(), db.foods.clear(), db.weighIns.clear(), db.sets.clear(), db.exercises.clear()])
    if (data.profile) await db.profile.put(data.profile)
    await db.foods.bulkPut(data.foods ?? [])
    await db.weighIns.bulkPut(data.weighIns ?? [])
    await db.sets.bulkPut(data.sets ?? [])
    await db.exercises.bulkPut(data.exercises ?? [])
  })
}
