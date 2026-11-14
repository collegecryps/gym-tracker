import { describe, expect, it } from 'vitest'
import { daysAgoStr, type DayTemplate, type LiftSet } from './db'
import { DEFAULT_EXERCISES } from './plan'
import { DEFAULT_TEMPLATES, buildWorkout, rankExercises, templateFor } from './program'

const today = daysAgoStr(0)
const weekStart = daysAgoStr(6)
const lookup = (n: string) => DEFAULT_EXERCISES.find((e) => e.name === n)
const tpl = (id: string) => DEFAULT_TEMPLATES.find((t) => t.id === id)!

function set(p: Partial<LiftSet>): LiftSet {
  return { date: daysAgoStr(3), time: 0, exercise: 'Bench Press', muscle: 'Chest', weightLb: 185, reps: 6, rir: 1, ...p }
}

function build(template: DayTemplate, history: LiftSet[] = []) {
  return buildWorkout({ template, library: DEFAULT_EXERCISES, history, today, weekStart, lookup })
}

describe('buildWorkout', () => {
  it('builds a default push day: chest pyramid + second chest move, shoulders, triceps', () => {
    const w = build(tpl('push'))
    expect(w.map((m) => m.muscle)).toEqual(['Chest', 'Shoulders', 'Triceps'])
    const chest = w[0]
    expect(chest.sets).toBe(6)
    expect(chest.exercises.map((e) => [e.exercise.name, e.sets, e.scheme])).toEqual([
      ['Incline Bench Press', 3, 'pyramid'],
      ['Bench Press', 3, 'straight'],
    ])
    // Evidence-based picks with no history: cable laterals, overhead triceps extension
    expect(w[1].exercises[0].exercise.name).toBe('Cable Lateral Raise')
    expect(w[1].exercises[0].reps).toBe('10–20')
    expect(w[2].exercises[0].exercise.name).toBe('Overhead Triceps Extension')
  })

  it('pull day uses the pinned rear-delt work for shoulders', () => {
    const w = build(tpl('pull'))
    expect(w[0].exercises[0].exercise.name).toBe('Lat Pulldown')
    expect(w[0].exercises[0].scheme).toBe('pyramid')
    expect(w[2].exercises[0].exercise.name).toBe('Rear Delt Fly')
  })

  it('legs day leads with a compound and uses seated leg curls', () => {
    const w = build(tpl('legs'))
    expect(w[0].exercises.map((e) => e.exercise.name)).toEqual(['Hack Squat', 'Squat'])
    expect(w[1].exercises.map((e) => e.exercise.name)).toEqual(['Romanian Deadlift', 'Seated Leg Curl'])
    expect(w[1].exercises.map((e) => e.sets)).toEqual([3, 2])
  })

  it('prefers lifts you already do, and shows your target', () => {
    const w = build(tpl('push'), [set({ weightLb: 185, reps: 6 }), set({ exercise: 'Pec Deck', reps: 12, weightLb: 100 })])
    expect(w[0].exercises.map((e) => e.exercise.name)).toEqual(['Bench Press', 'Pec Deck'])
    expect(w[0].exercises[0].target).toMatch(/185 × 7\+/)
  })

  it('still leads with a compound when your most-done chest lift is an isolation', () => {
    const w = build(tpl('push'), [set({ exercise: 'Cable Fly', reps: 12, weightLb: 30 })])
    expect(w[0].exercises[0].exercise.name).toBe('Incline Bench Press')
    expect(w[0].exercises[1].exercise.name).toBe('Cable Fly')
  })

  it('counts this week, trims near the ceiling and skips past it', () => {
    const many = (n: number, muscle: string, exercise: string) => Array.from({ length: n }, () => set({ muscle, exercise }))
    const w = build(tpl('push'), [...many(17, 'Chest', 'Pec Deck'), ...many(20, 'Triceps', 'Triceps Pushdown')])
    expect(w[0].weekSoFar).toBe(17)
    expect(w[0].sets).toBe(3)
    expect(w[0].note).toMatch(/Trimmed to 3 sets/)
    expect(w[2].sets).toBe(0)
    expect(w[2].exercises).toEqual([])
    expect(w[2].note).toMatch(/Skip it today/)
  })

  it('gives helper muscles half credit and ignores warm-ups and old sets', () => {
    const w = build(tpl('push'), [
      set({}), // bench → chest 1, triceps 0.5, shoulders 0.5
      set({ rir: 4 }), // warm-up: not counted
      set({ date: daysAgoStr(8) }), // last week: not counted
    ])
    expect(w[0].weekSoFar).toBe(1)
    expect(w[2].weekSoFar).toBe(0.5)
  })

  it("does not count today's sets as this week's, and tracks them as done", () => {
    const w = build(tpl('push'), [set({ date: today }), set({ date: today })])
    expect(w[0].weekSoFar).toBe(0)
    expect(w[0].sets).toBe(6)
    const bench = w[0].exercises.find((e) => e.exercise.name === 'Bench Press')
    expect(bench?.doneToday).toBe(2)
  })

  it('never uses the same exercise twice in a day', () => {
    const custom: DayTemplate = { id: 'custom', muscles: [{ name: 'Hamstrings', sets: 5 }, { name: 'Glutes', sets: 3 }], pinned: {} }
    const names = build(custom).flatMap((m) => m.exercises.map((e) => e.exercise.name))
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(['Romanian Deadlift', 'Seated Leg Curl', 'Hip Thrust'])
  })

  it('honors pinned exercises in order', () => {
    const t: DayTemplate = { ...tpl('push'), pinned: { Chest: ['Dips', 'Cable Fly'] } }
    expect(build(t)[0].exercises.map((e) => [e.exercise.name, e.scheme])).toEqual([
      ['Dips', 'pyramid'],
      ['Cable Fly', 'straight'],
    ])
  })
})

describe('rankExercises', () => {
  it('includes custom exercises for the muscle', () => {
    const lib = [...DEFAULT_EXERCISES, { name: 'Pendulum Squat', muscle: 'Quads' }]
    const r = rankExercises('Quads', lib, [set({ exercise: 'Pendulum Squat', muscle: 'Quads' })])
    expect(r[0].name).toBe('Pendulum Squat')
  })
})

describe('templateFor', () => {
  it('uses a saved version when there is one', () => {
    const saved: DayTemplate = { id: 'push', muscles: [{ name: 'Chest', sets: 8 }], pinned: {} }
    expect(templateFor('push', [saved])).toBe(saved)
    expect(templateFor('legs', [saved]).muscles[0].name).toBe('Quads')
  })
})
