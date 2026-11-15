import { todayStr, type Food, type LiftSession, type LiftSet, type Profile, type WeighIn } from './db'

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
  /** Calories for a rest day. On lifting days `calories` = this + liftCalories. */
  baseCalories: number
  lift: LiftEstimate
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

// ---------- Lifting-day calories ----------

/** 2024 Compendium of Physical Activities. 1 MET ≈ 1 kcal per kg per hour.
 * 02054 resistance training, multiple exercises, 8–15 reps = 3.5 METs.
 * 02052 resistance training, squats and deadlifts = 5.0 METs. */
export const LIFT_METS = 3.5
export const SQUAT_DEADLIFT_METS = 5.0
// Minimum time counted for one set (the set itself plus a short rest).
const MIN_PER_SET = 2
// A gap longer than this between sets is a break (or logging later), not rest between sets.
const MAX_GAP_MIN = 15

export function liftMets(exercise: string): number {
  return /squat|deadlift/i.test(exercise) ? SQUAT_DEADLIFT_METS : LIFT_METS
}

export interface LiftEstimate {
  minutes: number
  calories: number
  byExercise: { name: string; minutes: number; calories: number }[]
}

/** Estimate a lifting day. Each set gets the time since the set before it (or since Start lift),
 * between 2 and 15 minutes; with a session, the time after the last set goes to the last exercise.
 * Calories are those burned above resting (MET − 1), which the daily target already covers. */
export function liftSession(
  daySets: LiftSet[],
  weightLb: number,
  session?: LiftSession,
  now = Date.now(),
): LiftEstimate {
  const kg = weightLb / LB_PER_KG
  const sets = [...daySets].sort((a, b) => a.time - b.time)
  const mins = new Map<string, number>()
  const add = (name: string, m: number) => mins.set(name, (mins.get(name) ?? 0) + m)
  const clamp = (m: number, lo: number) => Math.min(Math.max(m, lo), MAX_GAP_MIN)
  let prev = session?.start
  for (const s of sets) {
    add(s.exercise, prev === undefined ? MIN_PER_SET : clamp((s.time - prev) / 60000, MIN_PER_SET))
    prev = s.time
  }
  if (session && prev !== undefined) {
    const tail = clamp(((session.end ?? now) - prev) / 60000, 0)
    add(sets.length ? sets[sets.length - 1].exercise : 'Warm-up', tail)
  }
  const byExercise = [...mins].map(([name, m]) => ({
    name,
    minutes: m,
    calories: ((liftMets(name) - 1) * kg * m) / 60,
  }))
  return {
    minutes: Math.round(byExercise.reduce((t, e) => t + e.minutes, 0)),
    calories: Math.round(byExercise.reduce((t, e) => t + e.calories, 0)),
    byExercise: byExercise.map((e) => ({ ...e, minutes: Math.round(e.minutes), calories: Math.round(e.calories) })),
  }
}

/** All lifting on one day. Each set belongs to the timed lift it was logged during; sets logged
 * outside any timed lift are estimated from the gaps between them. */
export function dayLift(daySets: LiftSet[], weightLb: number, daySessions: LiftSession[], now = Date.now()): LiftEstimate {
  const parts: LiftEstimate[] = []
  let rest = daySets
  for (const x of [...daySessions].sort((a, b) => a.start - b.start)) {
    const inside = (s: LiftSet) => s.time >= x.start && s.time <= (x.end ?? Infinity)
    parts.push(liftSession(rest.filter(inside), weightLb, x, now))
    rest = rest.filter((s) => !inside(s))
  }
  if (rest.length) parts.push(liftSession(rest, weightLb))
  const byName = new Map<string, { name: string; minutes: number; calories: number }>()
  for (const e of parts.flatMap((p) => p.byExercise)) {
    const cur = byName.get(e.name) ?? { name: e.name, minutes: 0, calories: 0 }
    byName.set(e.name, { name: e.name, minutes: cur.minutes + e.minutes, calories: cur.calories + e.calories })
  }
  return {
    minutes: parts.reduce((t, p) => t + p.minutes, 0),
    calories: parts.reduce((t, p) => t + p.calories, 0),
    byExercise: [...byName.values()],
  }
}

/** Activity levels for life outside the gym (TDEE multipliers). */
export const ACTIVITY = [
  { value: 1.2, label: 'Desk job, little walking' },
  { value: 1.375, label: 'Desk job, walk some most days' },
  { value: 1.55, label: 'On my feet most of the day' },
  { value: 1.725, label: 'Physical job (construction, warehouse)' },
]

// Older profiles picked an activity level that already included lifting. Lifting is now added per
// day, so map those to the matching level for life outside the gym.
const LEGACY_ACTIVITY: Record<number, number> = { 1.375: 1.375, 1.55: 1.375, 1.725: 1.55, 1.9: 1.725 }

/** Activity multiplier for daily life, not counting lifting. */
export function dailyActivity(p: Profile): number {
  return p.activityExcludesLifting ? p.activity : (LEGACY_ACTIVITY[p.activity] ?? p.activity)
}

export function computeTargets(
  p: Profile,
  weighIns: WeighIn[],
  foods: Food[],
  sets: LiftSet[] = [],
  date = todayStr(),
  sessions: LiftSession[] = [],
): Targets {
  const weight = currentWeight(p, weighIns)
  const targetRateLb = (weight * p.gainPctPerWeek) / 100
  const actualRateLb = weightRate(weighIns)

  const setsByDay = new Map<string, LiftSet[]>()
  for (const s of sets) setsByDay.set(s.date, [...(setsByDay.get(s.date) ?? []), s])
  const liftBurn = (d: string) => dayLift(setsByDay.get(d) ?? [], weight, sessions.filter((x) => x.date === d))

  // Formula estimate of maintenance calories on a rest day.
  let tdee = bmr(p, weight) * dailyActivity(p)
  let tdeeSource: Targets['tdeeSource'] = 'formula'

  // If there's enough logging, learn real maintenance from what was eaten vs. how weight moved.
  if (actualRateLb !== null) {
    const cutoff = Date.now() - 21 * 864e5
    const byDay = new Map<string, number>()
    for (const f of foods) {
      if (new Date(f.date + 'T12:00').getTime() >= cutoff) byDay.set(f.date, (byDay.get(f.date) ?? 0) + f.calories)
    }
    const loggedDays = [...byDay].filter(([, c]) => c > 800) // skip days clearly not fully logged
    if (loggedDays.length >= 10) {
      const avgIntake = loggedDays.reduce((s, [, c]) => s + c, 0) / loggedDays.length
      // Lifting calories are added back on lifting days, so learn rest-day maintenance.
      const avgLift = loggedDays.reduce((s, [d]) => s + liftBurn(d).calories, 0) / loggedDays.length
      const learned = avgIntake - avgLift - (actualRateLb * 3500) / 7
      // Keep it sane: never drift more than 30% from the formula.
      tdee = Math.min(Math.max(learned, tdee * 0.7), tdee * 1.3)
      tdeeSource = 'your data'
    }
  }

  const baseCalories = Math.round((tdee + (targetRateLb * 3500) / 7) / 10) * 10
  const lift = liftBurn(date)
  const calories = baseCalories + lift.calories
  // Protein and fat are set by bodyweight, so lifting calories go to carbs.
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
    baseCalories,
    lift,
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

// Rep targets. Growth is similar anywhere from ~5 to 30 reps when sets are taken close to failure
// (Schoenfeld 2017 loading meta-analysis), and heavy sets of 3–5 built as much muscle as sets of
// 10 when volume was matched, at the cost of more sets and more joint strain (Schoenfeld 2014).
// Straight sets: double progression inside 6–12. Pyramids (weight up, reps down each set):
// the heaviest set progresses inside 4–8; ascending pyramids grow muscle as well as straight
// sets (Angleri 2017).
export const REP_MIN = 6
export const REP_MAX = 12
export const PYRAMID_TOP_MIN = 4
export const PYRAMID_TOP_MAX = 8
// Below this, a set is mostly strength work and adds little size per set.
export const LOW_REP_NOTE = 4

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
  pyramid: boolean
  text: string
}

export function weightStep(weightLb: number): number {
  return weightLb >= 100 ? 5 : 2.5
}

/** A session is a pyramid if the weight goes up across at least two sets. */
export function isPyramid(sets: LiftSet[]): boolean {
  const weights = sets.map((s) => s.weightLb)
  return new Set(weights).size >= 2 && weights.every((w, i) => i === 0 || w >= weights[i - 1])
}

/** Sets from the most recent session before today, in the order they were done. */
export function lastSession(exerciseSets: LiftSet[], today: string): { date: string; sets: LiftSet[] } | null {
  const previous = exerciseSets.filter((s) => s.date < today)
  if (!previous.length) return null
  const date = previous.reduce((m, s) => (s.date > m ? s.date : m), '')
  return { date, sets: previous.filter((s) => s.date === date).sort((a, b) => a.time - b.time) }
}

/** Double progression on the top set. For pyramids the top set is the heaviest one. */
export function nextSessionSuggestion(exerciseSets: LiftSet[], today: string): Suggestion | null {
  const last = lastSession(exerciseSets, today)
  if (!last) return null
  const pyramid = isPyramid(last.sets)
  const top = pyramid
    ? last.sets.reduce((best, s) => (s.weightLb >= best.weightLb ? s : best))
    : last.sets.reduce((best, s) => (e1rm(s.weightLb, s.reps) > e1rm(best.weightLb, best.reps) ? s : best))
  const [lo, hi] = pyramid ? [PYRAMID_TOP_MIN, PYRAMID_TOP_MAX] : [REP_MIN, REP_MAX]
  const step = weightStep(top.weightLb)
  const label = pyramid ? 'Last top set' : 'Last time'
  let text: string
  if (top.reps >= hi) {
    text = `${label}: ${top.weightLb} × ${top.reps}. That's the top of ${lo}–${hi}, so go up: ${top.weightLb + step} lb for ${lo}+ reps.`
  } else {
    text = `${label}: ${top.weightLb} × ${top.reps}. Beat it: ${top.weightLb} × ${top.reps + 1}+.`
  }
  if (top.reps < LOW_REP_NOTE) {
    text += ` Under ${LOW_REP_NOTE} reps mostly builds strength; for size, keep the top set at ${LOW_REP_NOTE}+.`
  }
  if (top.rir !== undefined && top.rir > HARD_SET_MAX_RIR) {
    text += ` That set had ${top.rir}+ reps left; take working sets to 0–3 reps from failure.`
  }
  return { lastDate: last.date, lastSets: last.sets, pyramid, text }
}

/**
 * What to fill in for the next set. Matches the same set number from last session if there is
 * one; otherwise steps up from the set just done (heavier, fewer reps), or repeats it for straight sets.
 */
export function nextSetPrefill(lastSets: LiftSet[], todaySets: LiftSet[]): { weightLb: number; reps: number } | null {
  const n = todaySets.length
  if (lastSets[n]) return { weightLb: lastSets[n].weightLb, reps: lastSets[n].reps }
  const prev = todaySets[n - 1]
  if (!prev) return lastSets.length ? { weightLb: lastSets[0].weightLb, reps: lastSets[0].reps } : null
  const climbing = isPyramid(todaySets) || isPyramid(lastSets)
  return climbing
    ? { weightLb: prev.weightLb + weightStep(prev.weightLb) * 2, reps: Math.max(1, prev.reps - 2) }
    : { weightLb: prev.weightLb, reps: prev.reps }
}

// ---------- History & progress ----------

export interface Workout {
  date: string
  exercises: { name: string; sets: LiftSet[] }[]
}

/** Group sets into workouts by day (newest first), exercises in the order they were done. */
export function workoutsByDay(sets: LiftSet[]): Workout[] {
  const days = new Map<string, LiftSet[]>()
  for (const s of sets) days.set(s.date, [...(days.get(s.date) ?? []), s])
  return [...days]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, daySets]) => {
      const byEx = new Map<string, LiftSet[]>()
      for (const s of [...daySets].sort((a, b) => a.time - b.time)) byEx.set(s.exercise, [...(byEx.get(s.exercise) ?? []), s])
      return { date, exercises: [...byEx].map(([name, exSets]) => ({ name, sets: exSets })) }
    })
}

/** One point per session: the best estimated 1-rep max that day, oldest first. */
export function strengthProgress(exerciseSets: LiftSet[]): { date: string; value: number; note: string }[] {
  const best = new Map<string, LiftSet>()
  for (const s of exerciseSets) {
    const b = best.get(s.date)
    if (!b || e1rm(s.weightLb, s.reps) > e1rm(b.weightLb, b.reps)) best.set(s.date, s)
  }
  return [...best]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({ date, value: Math.round(e1rm(s.weightLb, s.reps)), note: `${s.weightLb} × ${s.reps}` }))
}
