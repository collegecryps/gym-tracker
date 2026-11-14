// Builds a day's workout from a template (Push / Pull / Legs / Custom), the user's history and
// this week's volume. Pure functions: easy to test, no database access.

import type { DayTemplate, LiftSet } from './db'
import {
  VOLUME_MAX,
  isHardSet,
  nextSessionSuggestion,
  type ExerciseDef,
} from './plan'

export const DAY_NAMES: Record<string, string> = { push: 'Push', pull: 'Pull', legs: 'Legs', custom: 'Custom' }

/**
 * Default templates. Sets per muscle per session: running push/pull/legs twice a week puts big
 * muscles at ~12 hard sets a week, inside the 10–20 range. Compound lifts also give helper muscles
 * half-credit, so triceps/biceps/glutes need fewer direct sets.
 */
export const DEFAULT_TEMPLATES: DayTemplate[] = [
  {
    id: 'push',
    muscles: [
      { name: 'Chest', sets: 6 },
      { name: 'Shoulders', sets: 4 },
      { name: 'Triceps', sets: 4 },
    ],
    pinned: {},
  },
  {
    id: 'pull',
    muscles: [
      { name: 'Back', sets: 6 },
      { name: 'Biceps', sets: 4 },
      { name: 'Shoulders', sets: 3 }, // rear delts
    ],
    pinned: { Shoulders: ['Rear Delt Fly', 'Face Pull'] },
  },
  {
    id: 'legs',
    muscles: [
      { name: 'Quads', sets: 6 },
      { name: 'Hamstrings', sets: 5 },
      { name: 'Calves', sets: 4 },
      { name: 'Abs', sets: 3 },
    ],
    pinned: {},
  },
  { id: 'custom', muscles: [], pinned: {} },
]

export const DEFAULT_SETS: Record<string, number> = {
  Chest: 6,
  Back: 6,
  Quads: 6,
  Hamstrings: 5,
  Shoulders: 4,
  Biceps: 4,
  Triceps: 4,
  Glutes: 3,
  Calves: 4,
  Abs: 3,
  Forearms: 3,
}

/**
 * Best picks per muscle when the user has no history, most useful first. Big compound first for
 * the pyramid; then exercises that load the muscle at long lengths, which grew more muscle in
 * head-to-head studies (overhead vs. pushdown triceps work, Maeo 2023; seated vs. lying leg curl,
 * Maeo 2021).
 */
export const PRIORITY: Record<string, string[]> = {
  Chest: ['Incline Bench Press', 'Bench Press', 'Incline Dumbbell Press', 'Cable Fly', 'Machine Chest Press', 'Pec Deck', 'Dips'],
  Back: ['Lat Pulldown', 'Pull-up', 'Chest-Supported Row', 'Seated Cable Row', 'Barbell Row', 'Single-Arm Dumbbell Row'],
  Shoulders: ['Cable Lateral Raise', 'Lateral Raise', 'Dumbbell Shoulder Press', 'Overhead Press', 'Rear Delt Fly', 'Face Pull'],
  Biceps: ['Incline Dumbbell Curl', 'Preacher Curl', 'Barbell Curl', 'Hammer Curl', 'Dumbbell Curl'],
  Triceps: ['Overhead Triceps Extension', 'Skull Crusher', 'Triceps Pushdown', 'Close-Grip Bench Press'],
  Quads: ['Hack Squat', 'Squat', 'Leg Press', 'Leg Extension', 'Bulgarian Split Squat'],
  Hamstrings: ['Romanian Deadlift', 'Seated Leg Curl', 'Lying Leg Curl'],
  Glutes: ['Hip Thrust', 'Bulgarian Split Squat', 'Romanian Deadlift'],
  Calves: ['Standing Calf Raise', 'Seated Calf Raise'],
  Abs: ['Cable Crunch', 'Hanging Leg Raise'],
  Forearms: ['Wrist Curl', 'Hammer Curl'],
}

/** Muscles big enough to lead with a heavy pyramided compound. */
const PYRAMID_MUSCLES = new Set(['Chest', 'Back', 'Quads', 'Hamstrings'])

/** Isolation moves that respond better to higher reps (small muscles, joint-friendly). */
const HIGH_REP = new Set(['Lateral Raise', 'Cable Lateral Raise', 'Rear Delt Fly', 'Face Pull', 'Standing Calf Raise', 'Seated Calf Raise', 'Cable Crunch', 'Hanging Leg Raise', 'Wrist Curl'])

export interface PlannedExercise {
  exercise: ExerciseDef
  muscle: string
  sets: number
  scheme: 'pyramid' | 'straight'
  reps: string // e.g. "10 → 8 → 6 → 4–8" or "8–12"
  target: string | null // progression target from last session
  doneToday: number // sets already logged today
}

export interface PlannedMuscle {
  muscle: string
  weekSoFar: number // hard sets in the 6 days before today
  sets: number // sets planned today
  note: string | null
  exercises: PlannedExercise[]
}

export interface PlanInput {
  template: DayTemplate
  library: ExerciseDef[]
  history: LiftSet[] // all sets, including today
  today: string
  weekStart: string // first date counted as "this week" (6 days before today)
  lookup: (name: string) => ExerciseDef | undefined
}

/** Order exercises for a muscle: pinned first, then ones the user has done most, then the priority list. */
export function rankExercises(muscle: string, library: ExerciseDef[], history: LiftSet[], pinned: string[] = []): ExerciseDef[] {
  const forMuscle = library.filter((e) => e.muscle === muscle)
  const count = new Map<string, number>()
  for (const s of history) count.set(s.exercise, (count.get(s.exercise) ?? 0) + 1)
  const prio = PRIORITY[muscle] ?? []
  const rank = (e: ExerciseDef) => {
    const p = pinned.indexOf(e.name)
    if (p >= 0) return p
    const pr = prio.indexOf(e.name)
    // Exercises the user already does come first (numbers to beat), then the evidence-based list.
    return 100 + (count.has(e.name) ? 0 : 1000) + (pr >= 0 ? pr : 500)
  }
  return [...forMuscle].sort((a, b) => rank(a) - rank(b) || (count.get(b.name) ?? 0) - (count.get(a.name) ?? 0))
}

export function buildWorkout({ template, library, history, today, weekStart, lookup }: PlanInput): PlannedMuscle[] {
  const before = history.filter((s) => s.date < today)
  const week = before.filter((s) => s.date >= weekStart && isHardSet(s))
  const todaySets = history.filter((s) => s.date === today)
  const used = new Set<string>()

  return template.muscles.map(({ name: muscle, sets: wanted }) => {
    // Hard sets this muscle already got this week (direct = 1, helper = 0.5).
    let weekSoFar = 0
    for (const s of week) {
      if (s.muscle === muscle) weekSoFar += 1
      else if (lookup(s.exercise)?.secondary?.includes(muscle)) weekSoFar += 0.5
    }
    let sets = wanted
    let note: string | null = null
    if (weekSoFar >= VOLUME_MAX) {
      sets = 0
      note = `Already ${weekSoFar} hard sets this week, at the ${VOLUME_MAX}-set ceiling. Skip it today and let it recover.`
    } else if (weekSoFar + sets > VOLUME_MAX) {
      sets = Math.max(1, Math.floor(VOLUME_MAX - weekSoFar))
      note = `Trimmed to ${sets} sets: ${weekSoFar} this week already, ${VOLUME_MAX} is the useful ceiling.`
    }

    const pinned = template.pinned[muscle] ?? []
    const ranked = rankExercises(muscle, library, before, pinned).filter((e) => !used.has(e.name))
    // Lead big muscles with a compound for the pyramid, unless the user pinned something first.
    if (PYRAMID_MUSCLES.has(muscle) && !pinned.length) {
      const c = ranked.findIndex((e) => e.secondary?.length)
      if (c > 0) ranked.unshift(...ranked.splice(c, 1))
    }
    // 5+ sets: two exercises (heavy compound + a different angle). Fewer: one.
    const split = sets >= 5 ? [Math.ceil(sets / 2), Math.floor(sets / 2)] : sets > 0 ? [sets] : []
    const exercises: PlannedExercise[] = []
    split.forEach((n, i) => {
      const ex = ranked[i]
      if (!ex) return
      used.add(ex.name)
      const exHistory = history.filter((s) => s.exercise === ex.name)
      const pyramid = i === 0 && PYRAMID_MUSCLES.has(muscle) && !!ex.secondary?.length
      exercises.push({
        exercise: ex,
        muscle,
        sets: n,
        scheme: pyramid ? 'pyramid' : 'straight',
        reps: pyramid ? 'top set of 4–8' : HIGH_REP.has(ex.name) ? '10–20' : '6–12',
        target: nextSessionSuggestion(exHistory, today)?.text ?? null,
        doneToday: todaySets.filter((s) => s.exercise === ex.name).length,
      })
    })
    return { muscle, weekSoFar, sets, note, exercises }
  })
}

export function templateFor(id: string, saved: DayTemplate[]): DayTemplate {
  return saved.find((t) => t.id === id) ?? DEFAULT_TEMPLATES.find((t) => t.id === id) ?? DEFAULT_TEMPLATES[3]
}

