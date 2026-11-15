import { useLiveQuery } from 'dexie-react-hooks'
import { db, daysAgoStr, todayStr, type Profile } from './db'
import { computeTargets, type Targets } from './plan'

/** Targets for one day; lifting logged that day raises its calories. */
export function useTargets(profile: Profile, date = todayStr()): Targets | undefined {
  return useLiveQuery(async () => {
    const since = daysAgoStr(30)
    const from = since < date ? since : date
    const [weighIns, foods, sets, sessions] = await Promise.all([
      db.weighIns.where('date').aboveOrEqual(since).toArray(),
      db.foods.where('date').aboveOrEqual(since).toArray(),
      db.sets.where('date').aboveOrEqual(from).toArray(),
      db.sessions.where('date').aboveOrEqual(from).toArray(),
    ])
    return computeTargets(profile, weighIns, foods, sets, date, sessions)
  }, [profile, date])
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
