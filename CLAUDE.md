# Gym Tracker

Personal lifting tracker (food, lifts, bodyweight; bulk or cut) for the owner and one friend. Not public.
Installed on iPhone as a home-screen web app (PWA), not an App Store app (decided).

## Run

- `npm run dev` (Vite), typecheck `npx tsc -b`, lint `npm run lint`.
- `npm test`: unit tests (Vitest, `src/*.test.ts`) + browser tests (Playwright, `tests/e2e`, iPhone
  viewport in WebKit and Chromium). Gemini is mocked in browser tests; no key needed.
- Deploy: `npm run deploy` (typecheck, unit tests, build with `BASE=/gym-tracker/`, push `dist` to
  the `gh-pages` branch). Live at https://collegecryps.github.io/gym-tracker/. No GitHub Actions:
  the gh token lacks `workflow` scope, so deploys are manual from this Mac.

- **Always ask the owner before deploying** (`npm run deploy`) or pushing. They often batch several
  changes before going live. (Corrected 2026-11-14 after a deploy without asking.)

## Stack

React + TypeScript + Vite, `vite-plugin-pwa`, Dexie (IndexedDB).

## Decisions

- **Each person's data stays on their own phone** (IndexedDB). No backend, no accounts. Separate
  data per person was a requirement. Backup/restore is a JSON export in More.
- **Must stay free.** Photo recognition uses Google Gemini's free tier; each user pastes their own
  key in Settings (stored locally). No paid API keys.
- Food entries from photos are always editable by hand (requirement).
- **Lifting/nutrition rules must be evidence-based** (owner's requirement). Every rule lives in
  `src/plan.ts` and is cited in `src/science.ts` (shown on the More screen). Don't add a rule
  without a source.
- Food onboarding/quiz style is modeled on Noom's intake flow (one question per screen).
- Units: lb and inches.
- **Lifting-day calories (owner's choice):** the activity setting means life outside the gym; each
  lifting day adds the workout's burn (Compendium METs × minutes × bodyweight, above resting) to
  that day's target, as carbs. Minutes come from Start lift / Finish (`sessions` table) or from
  set timestamps. Old profiles without `activityExcludesLifting` are mapped by `dailyActivity`.
- **Own targets (2026-11-23):** More → "Use my own targets" stores `profile.customTargets`; they
  replace the computed targets and stay flat every day (no lifting add-on). Goal can be a cut
  (negative `gainPctPerWeek`, -0.25/-0.5/-0.75%); coaching handles both directions.
- New exercise names typed in the exercise search or the ⇄ swap list are saved to `db.exercises`
  for future use; the main muscle is guessed from the name (`guessMuscle`).
- Recipes (Food → 🍳): Gemini text call for meals that fill what's left of the day; the last set
  is cached per day in localStorage so reopening doesn't use free quota.
- **Saved foods (2026-11-23):** every logged food is upserted into `db.savedFoods` (keyed by
  lowercase name, newest numbers win), capped at 40 by least-recently used. Deleting a log entry
  does not remove it. Grouped by `FOOD_CATEGORIES` (`src/foodCategories.ts`): Gemini picks the
  category for photos, otherwise a keyword guess; editable in the food editor. DB version 4
  backfills it from the existing log.

## Gotchas

- Safari/WebKit can't reliably store Blobs in IndexedDB. Photos are stored as JPEG data URLs.
  Don't switch back to Blobs.
- Gemini's free models often return 503 "high demand". `src/ai.ts` retries, then falls back to
  the `gemini-flash-lite-latest` alias. Use `-latest` aliases, not version numbers; free model
  names change often.
- macOS file names are case-insensitive: `savedFoods.ts` and `SavedFoods.tsx` collide. The sheet
  is `SavedFoodsSheet.tsx`.

## Files

- `src/plan.ts` calorie/macro targets, adaptive maintenance, volume, progression, history helpers.
- `src/program.ts` workout builder (Push/Pull/Legs/Custom templates → exercises + sets for today).
  Owner trains push/pull/legs with ascending pyramids on the first big lift.
- `src/ai.ts` Gemini calls (food, equipment, recipes) and photo shrinking. `src/Recipes.tsx` recipe sheet.
- `src/db.ts` schema + backup.
