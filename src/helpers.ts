import { useLiveQuery } from 'dexie-react-hooks'
import { db, daysAgoStr, type Profile } from './db'
import { computeTargets, type Targets } from './plan'

export function useTargets(profile: Profile): Targets | undefined {
  return useLiveQuery(async () => {
    const since = daysAgoStr(30)
    const [weighIns, foods] = await Promise.all([
      db.weighIns.where('date').aboveOrEqual(since).toArray(),
      db.foods.where('date').aboveOrEqual(since).toArray(),
    ])
    return computeTargets(profile, weighIns, foods)
  }, [profile])
}

export function prettyDate(date: string): string {
  const d = new Date(date + 'T12:00')
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T12:00')
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  return `${y}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
