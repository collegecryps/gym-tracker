import { describe, expect, it } from 'vitest'
import { daysAgoStr, type Food, type LiftSet, type Profile, type WeighIn } from './db'
import {
  DEFAULT_EXERCISES,
  computeTargets,
  e1rm,
  nextSessionSuggestion,
  weeklyFrequencyByMuscle,
  weeklySetsByMuscle,
  weightRate,
} from './plan'

const profile: Profile = {
  id: 1,
  name: 'Test',
  sex: 'male',
  age: 24,
  heightIn: 72,
  startWeightLb: 175,
  activity: 1.55,
  gainPctPerWeek: 0.375,
  geminiKey: '',
  geminiModel: 'x',
}

/** Daily weigh-ins for the last `days` days, changing by `perDay` lb each day. */
function weighIns(days: number, start: number, perDay: number): WeighIn[] {
  return Array.from({ length: days }, (_, i) => ({ date: daysAgoStr(days - 1 - i), weightLb: start + perDay * i }))
}

function foods(days: number, calories: number): Food[] {
  return Array.from({ length: days }, (_, i) => ({
    date: daysAgoStr(i),
    time: 0,
    name: 'x',
    calories,
    protein: 0,
    carbs: 0,
    fat: 0,
    aiEstimated: false,
  }))
}

const lookup = (n: string) => DEFAULT_EXERCISES.find((e) => e.name === n)

function set(p: Partial<LiftSet>): LiftSet {
  return { date: daysAgoStr(0), time: Date.now(), exercise: 'Bench Press', muscle: 'Chest', weightLb: 185, reps: 8, rir: 2, ...p }
}

describe('computeTargets', () => {
  it('uses Mifflin-St Jeor × activity plus the lean-bulk surplus with no data', () => {
    const t = computeTargets(profile, [], [])
    // BMR 1821.8 × 1.55 = 2823.8; target 0.656 lb/wk → +328 kcal/day
    expect(t.tdee).toBe(2824)
    expect(t.tdeeSource).toBe('formula')
    expect(t.calories).toBe(3150)
    expect(t.targetRateLb).toBeCloseTo(0.656, 2)
    expect(t.protein).toBe(175) // 1 g/lb
    expect(t.fat).toBe(61) // 0.35 g/lb
    expect(t.carbs).toBe(475) // remainder
    expect(t.actualRateLb).toBeNull()
  })

  it('uses a female BMR offset', () => {
    const t = computeTargets({ ...profile, sex: 'female' }, [], [])
    expect(t.tdee).toBe(Math.round((1821.79 - 166) * 1.55))
  })

  it('learns maintenance from intake and weight trend once there is enough data', () => {
    // Ate 3000/day for 21 days and weight stayed flat → maintenance ≈ 3000
    const t = computeTargets(profile, weighIns(21, 175, 0), foods(21, 3000))
    expect(t.tdeeSource).toBe('your data')
    expect(t.tdee).toBe(3000)
    expect(t.calories).toBe(Math.round((3000 + (175 * 0.375 * 3500) / 100 / 7) / 10) * 10)
  })

  it('accounts for weight gained when learning maintenance', () => {
    // Ate 3200/day while gaining 1 lb/wk → maintenance = 3200 − 500 = 2700
    const t = computeTargets(profile, weighIns(21, 175, 1 / 7), foods(21, 3200))
    expect(t.tdee).toBeCloseTo(2700, -1)
  })

  it('ignores barely-logged days and keeps the formula until 10 real days exist', () => {
    const t = computeTargets(profile, weighIns(21, 175, 0), [...foods(9, 3000), ...foods(21, 400)])
    expect(t.tdeeSource).toBe('formula')
  })

  it('clamps a learned maintenance that is wildly off the formula', () => {
    const t = computeTargets(profile, weighIns(21, 175, 0), foods(21, 9000))
    expect(t.tdee).toBe(Math.round(2823.8 * 1.3))
  })

  it('warns when gaining too fast and too slow, and confirms when on pace', () => {
    expect(computeTargets(profile, weighIns(21, 175, 2 / 7), []).coaching).toMatch(/faster than/)
    expect(computeTargets(profile, weighIns(21, 175, 0), []).coaching).toMatch(/slower than/)
    expect(computeTargets(profile, weighIns(21, 175, 0.65 / 7), []).coaching).toMatch(/On pace/)
  })
})

describe('weightRate', () => {
  it('returns lb/week from the trend', () => {
    expect(weightRate(weighIns(21, 175, 0.1))).toBeCloseTo(0.7, 2) // DST days are 23/25h
  })
  it('needs at least 4 weigh-ins spanning 10+ days', () => {
    expect(weightRate(weighIns(3, 175, 0.1))).toBeNull()
    expect(weightRate(weighIns(8, 175, 0.1))).toBeNull()
  })
  it('ignores weigh-ins older than the window', () => {
    const old = [{ date: daysAgoStr(60), weightLb: 150 }]
    expect(weightRate([...old, ...weighIns(21, 175, 0)])).toBeCloseTo(0, 5)
  })
})

describe('weekly volume', () => {
  it('counts the main muscle as 1 and helper muscles as 0.5', () => {
    const v = weeklySetsByMuscle([set({}), set({}), set({})], lookup)
    expect(v.get('Chest')).toBe(3)
    expect(v.get('Triceps')).toBe(1.5)
    expect(v.get('Shoulders')).toBe(1.5)
  })
  it('only counts hard sets (3 or fewer reps left); unknown RIR counts', () => {
    const v = weeklySetsByMuscle([set({ rir: 4 }), set({ rir: 3 }), set({ rir: undefined })], lookup)
    expect(v.get('Chest')).toBe(2)
  })
  it('ignores sets older than 7 days', () => {
    const v = weeklySetsByMuscle([set({ time: Date.now() - 8 * 864e5 })], lookup)
    expect(v.get('Chest')).toBeUndefined()
  })
  it('counts training days per muscle', () => {
    const f = weeklyFrequencyByMuscle([set({}), set({}), set({ date: daysAgoStr(3), time: Date.now() - 3 * 864e5 })])
    expect(f.get('Chest')).toBe(2)
  })
})

describe('progression', () => {
  const today = daysAgoStr(0)
  const last = (p: Partial<LiftSet>) => [set({ date: daysAgoStr(2), ...p })]

  it('says beat last time when inside the rep range', () => {
    expect(nextSessionSuggestion(last({ reps: 8 }), today)?.text).toMatch(/185 × 9\+/)
  })
  it('adds weight at the top of the range', () => {
    expect(nextSessionSuggestion(last({ reps: 12 }), today)?.text).toMatch(/190 lb/)
  })
  it('uses 2.5 lb jumps on light weights', () => {
    expect(nextSessionSuggestion(last({ weightLb: 25, reps: 12 }), today)?.text).toMatch(/27\.5 lb/)
  })
  it('drops weight when under the rep range', () => {
    expect(nextSessionSuggestion(last({ reps: 4 }), today)?.text).toMatch(/drop to about 180/)
  })
  it('nudges toward failure when sets were too easy', () => {
    expect(nextSessionSuggestion(last({ rir: 4 }), today)?.text).toMatch(/0–3 reps from failure/)
  })
  it('ignores today and picks the best set of the latest session', () => {
    const sets = [
      set({ date: daysAgoStr(5), weightLb: 100, reps: 8 }),
      set({ date: daysAgoStr(2), weightLb: 185, reps: 6 }),
      set({ date: daysAgoStr(2), weightLb: 175, reps: 10 }),
      set({ date: today, weightLb: 300, reps: 8 }),
    ]
    const s = nextSessionSuggestion(sets, today)!
    expect(s.lastDate).toBe(daysAgoStr(2))
    expect(s.text).toMatch(/175 × 10/) // e1RM 233 beats 185×6 (222)
  })
  it('returns nothing with no history', () => {
    expect(nextSessionSuggestion([set({ date: today })], today)).toBeNull()
  })
})

describe('e1rm', () => {
  it('uses Epley', () => {
    expect(e1rm(185, 8)).toBeCloseTo(234.33, 1)
    expect(e1rm(300, 1)).toBe(300)
  })
})
