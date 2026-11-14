import type { Food, LiftSet, Profile, WeighIn } from './db'

// ---------- Nutrition targets (lean bulk) ----------

export interface Targets {
  calories: number
  protein: number
  carbs: number
  fat: number
  tdee: number
  tdeeSource: 'formula' | 'your data'
  currentWeight: number
  targetRateLb: number // lb per week
  actualRateLb: number | null
  coaching: string
}

const LB_PER_KG = 2.20462

function bmr(p: Profile, weightLb: number): number {
  const kg = weightLb / LB_PER_KG
  const cm = p.heightIn * 2.54
  return 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'male' ? 5 : -161)
}

/** Slope of weight over time, in lb per week (least squares). Null if not enough data. */
export function weightRate(weighIns: WeighIn[], days = 21): number | null {
  const cutoff = Date.now() - days * 864e5
  const pts = weighIns
    .map((w) => ({ t: new Date(w.date + 'T12:00').getTime(), y: w.weightLb }))
    .filter((p) => p.t >= cutoff)
  if (pts.length < 4) return null
  const span = (Math.max(...pts.map((p) => p.t)) - Math.min(...pts.map((p) => p.t))) / 864e5
  if (span < 10) return null
  const n = pts.length
  const mt = pts.reduce((s, p) => s + p.t, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.t - mt) * (p.y - my)
    den += (p.t - mt) ** 2
  }
  return den === 0 ? null : (num / den) * 7 * 864e5
}

export function currentWeight(p: Profile, weighIns: WeighIn[]): number {
  const sorted = [...weighIns].sort((a, b) => a.date.localeCompare(b.date))
  const recent = sorted.slice(-7)
  if (!recent.length) return p.startWeightLb
  return recent.reduce((s, w) => s + w.weightLb, 0) / recent.length
}

export function computeTargets(p: Profile, weighIns: WeighIn[], foods: Food[]): Targets {
  const weight = currentWeight(p, weighIns)
  const targetRateLb = (weight * p.gainPctPerWeek) / 100
  const actualRateLb = weightRate(weighIns)

  // Formula estimate of maintenance calories.
  let tdee = bmr(p, weight) * p.activity
  let tdeeSource: Targets['tdeeSource'] = 'formula'

  // If there's enough logging, learn real maintenance from what was eaten vs. how weight moved.
  if (actualRateLb !== null) {
    const cutoff = Date.now() - 21 * 864e5
    const byDay = new Map<string, number>()
    for (const f of foods) {
      if (new Date(f.date + 'T12:00').getTime() >= cutoff) byDay.set(f.date, (byDay.get(f.date) ?? 0) + f.calories)
    }
    const loggedDays = [...byDay.values()].filter((c) => c > 800) // skip days clearly not fully logged
    if (loggedDays.length >= 10) {
      const avgIntake = loggedDays.reduce((s, c) => s + c, 0) / loggedDays.length
      const learned = avgIntake - (actualRateLb * 3500) / 7
      // Keep it sane: never drift more than 30% from the formula.
      tdee = Math.min(Math.max(learned, tdee * 0.7), tdee * 1.3)
      tdeeSource = 'your data'
    }
  }

  const calories = Math.round((tdee + (targetRateLb * 3500) / 7) / 10) * 10
  const protein = Math.round(weight * 1.0)
  const fat = Math.round(weight * 0.35)
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4))

  let coaching: string
  if (actualRateLb === null) {
    coaching = 'Weigh in most mornings. After about 2 weeks the app can tell if your calories are right.'
  } else if (actualRateLb > targetRateLb * 1.5 + 0.15) {
    coaching = `You're gaining ${actualRateLb.toFixed(2)} lb/wk, faster than the ${targetRateLb.toFixed(2)} target. More of it will be fat. Eat a bit less.`
  } else if (actualRateLb < targetRateLb * 0.5) {
    coaching = `You're gaining ${actualRateLb.toFixed(2)} lb/wk, slower than the ${targetRateLb.toFixed(2)} target. Eat a bit more.`
  } else {
    coaching = `On pace: ${actualRateLb.toFixed(2)} lb/wk against a ${targetRateLb.toFixed(2)} target. Keep going.`
  }

  return {
    calories,
    protein,
    carbs,
    fat,
    tdee: Math.round(tdee),
    tdeeSource,
    currentWeight: weight,
    targetRateLb,
    actualRateLb,
    coaching,
  }
}

// ---------- Lifting (evidence-based; see src/science.ts for sources) ----------

export const MUSCLES = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Abs',
  'Forearms',
] as const

export interface ExerciseDef {
  name: string
  muscle: string
  secondary?: string[] // counted as half a set (fractional volume, Pelland et al. 2024)
}

export const DEFAULT_EXERCISES: ExerciseDef[] = [
  { name: 'Bench Press', muscle: 'Chest', secondary: ['Triceps', 'Shoulders'] },
  { name: 'Incline Bench Press', muscle: 'Chest', secondary: ['Shoulders', 'Triceps'] },
  { name: 'Incline Dumbbell Press', muscle: 'Chest', secondary: ['Shoulders', 'Triceps'] },
  { name: 'Dumbbell Bench Press', muscle: 'Chest', secondary: ['Triceps', 'Shoulders'] },
  { name: 'Machine Chest Press', muscle: 'Chest', secondary: ['Triceps', 'Shoulders'] },
  { name: 'Cable Fly', muscle: 'Chest' },
  { name: 'Pec Deck', muscle: 'Chest' },
  { name: 'Dips', muscle: 'Chest', secondary: ['Triceps', 'Shoulders'] },
  { name: 'Pull-up', muscle: 'Back', secondary: ['Biceps'] },
  { name: 'Lat Pulldown', muscle: 'Back', secondary: ['Biceps'] },
  { name: 'Barbell Row', muscle: 'Back', secondary: ['Biceps', 'Shoulders'] },
  { name: 'Seated Cable Row', muscle: 'Back', secondary: ['Biceps'] },
  { name: 'Chest-Supported Row', muscle: 'Back', secondary: ['Biceps', 'Shoulders'] },
  { name: 'Single-Arm Dumbbell Row', muscle: 'Back', secondary: ['Biceps'] },
  { name: 'Deadlift', muscle: 'Back', secondary: ['Glutes', 'Hamstrings'] },
  { name: 'Overhead Press', muscle: 'Shoulders', secondary: ['Triceps'] },
  { name: 'Dumbbell Shoulder Press', muscle: 'Shoulders', secondary: ['Triceps'] },
  { name: 'Lateral Raise', muscle: 'Shoulders' },
  { name: 'Cable Lateral Raise', muscle: 'Shoulders' },
  { name: 'Rear Delt Fly', muscle: 'Shoulders' },
  { name: 'Face Pull', muscle: 'Shoulders' },
  { name: 'Barbell Curl', muscle: 'Biceps', secondary: ['Forearms'] },
  { name: 'Dumbbell Curl', muscle: 'Biceps', secondary: ['Forearms'] },
  { name: 'Incline Dumbbell Curl', muscle: 'Biceps' },
  { name: 'Hammer Curl', muscle: 'Biceps', secondary: ['Forearms'] },
  { name: 'Preacher Curl', muscle: 'Biceps' },
  { name: 'Triceps Pushdown', muscle: 'Triceps' },
  { name: 'Overhead Triceps Extension', muscle: 'Triceps' },
  { name: 'Skull Crusher', muscle: 'Triceps' },
  { name: 'Close-Grip Bench Press', muscle: 'Triceps', secondary: ['Chest'] },
  { name: 'Squat', muscle: 'Quads', secondary: ['Glutes'] },
  { name: 'Hack Squat', muscle: 'Quads', secondary: ['Glutes'] },
  { name: 'Leg Press', muscle: 'Quads', secondary: ['Glutes'] },
  { name: 'Leg Extension', muscle: 'Quads' },
  { name: 'Bulgarian Split Squat', muscle: 'Quads', secondary: ['Glutes'] },
  { name: 'Romanian Deadlift', muscle: 'Hamstrings', secondary: ['Glutes', 'Back'] },
  { name: 'Lying Leg Curl', muscle: 'Hamstrings' },
  { name: 'Seated Leg Curl', muscle: 'Hamstrings' },
  { name: 'Hip Thrust', muscle: 'Glutes', secondary: ['Hamstrings'] },
  { name: 'Standing Calf Raise', muscle: 'Calves' },
  { name: 'Seated Calf Raise', muscle: 'Calves' },
  { name: 'Cable Crunch', muscle: 'Abs' },
  { name: 'Hanging Leg Raise', muscle: 'Abs' },
  { name: 'Wrist Curl', muscle: 'Forearms' },
]

// Weekly hard sets per muscle. Growth keeps rising with volume but with diminishing returns
// (Schoenfeld 2017; Pelland 2024). Under 10 is leaving gains on the table; past ~20 recovery
// usually becomes the limit.
export const VOLUME_MIN = 10
export const VOLUME_MAX = 20

// A set counts as "hard" if it ended within 3 reps of failure (Refalo 2023/2024).
// Sets logged without RIR are assumed hard.
export const HARD_SET_MAX_RIR = 3

// Rep target: growth is similar anywhere from ~5 to 30 reps when sets are taken close to failure
// (Schoenfeld 2017 loading meta-analysis). 6–12 is the most time-efficient default; the app uses
// double progression inside it.
export const REP_MIN = 6
export const REP_MAX = 12

export function isHardSet(s: LiftSet): boolean {
  return s.rir === undefined || s.rir <= HARD_SET_MAX_RIR
}

/** Estimated one-rep max (Epley). */
export function e1rm(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30)
}

/** Fractional hard sets per muscle over the last 7 days: 1 for the target muscle, 0.5 for each secondary. */
export function weeklySetsByMuscle(
  sets: LiftSet[],
  lookup: (exercise: string) => ExerciseDef | undefined,
): Map<string, number> {
  const cutoff = Date.now() - 7 * 864e5
  const out = new Map<string, number>()
  const add = (m: string, n: number) => out.set(m, (out.get(m) ?? 0) + n)
  for (const s of sets) {
    if (s.time < cutoff || !isHardSet(s)) continue
    add(s.muscle, 1)
    for (const m of lookup(s.exercise)?.secondary ?? []) add(m, 0.5)
  }
  return out
}

/** Days in the last 7 each muscle got direct work. Training a muscle 2+ times a week is the
 * evidence-backed default (Schoenfeld 2016). */
export function weeklyFrequencyByMuscle(sets: LiftSet[]): Map<string, number> {
  const cutoff = Date.now() - 7 * 864e5
  const days = new Map<string, Set<string>>()
  for (const s of sets) {
    if (s.time < cutoff) continue
    if (!days.has(s.muscle)) days.set(s.muscle, new Set())
    days.get(s.muscle)!.add(s.date)
  }
  return new Map([...days].map(([m, d]) => [m, d.size]))
}

export interface Suggestion {
  lastDate: string
  lastSets: LiftSet[]
  text: string
}

/** Double progression: add reps until the top of the range, then add weight and restart at the bottom. */
export function nextSessionSuggestion(exerciseSets: LiftSet[], today: string): Suggestion | null {
  const previous = exerciseSets.filter((s) => s.date < today)
  if (!previous.length) return null
  const lastDate = previous.reduce((m, s) => (s.date > m ? s.date : m), '')
  const lastSets = previous.filter((s) => s.date === lastDate).sort((a, b) => a.time - b.time)
  const top = lastSets.reduce((best, s) => (e1rm(s.weightLb, s.reps) > e1rm(best.weightLb, best.reps) ? s : best))
  const step = top.weightLb >= 100 ? 5 : 2.5
  const easy = top.rir !== undefined && top.rir > HARD_SET_MAX_RIR
  let text: string
  if (top.reps >= REP_MAX) {
    text = `Last time: ${top.weightLb} × ${top.reps}. You hit the top of the ${REP_MIN}–${REP_MAX} range, so add weight: ${top.weightLb + step} lb for ${REP_MIN}+ reps.`
  } else if (top.reps < REP_MIN) {
    text = `Last time: ${top.weightLb} × ${top.reps}. That's below ${REP_MIN} reps; drop to about ${Math.max(0, top.weightLb - step)} lb and work up within ${REP_MIN}–${REP_MAX}.`
  } else {
    text = `Last time: ${top.weightLb} × ${top.reps}. Beat it: ${top.weightLb} × ${top.reps + 1}+.`
  }
  if (easy) text += ` Last session's top set had ${top.rir} reps left; take sets to 0–3 reps from failure.`
  return { lastDate, lastSets, text }
}
