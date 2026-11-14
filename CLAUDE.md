# Gym Tracker

Personal lean-bulk tracker (food, lifts, bodyweight) for the owner and one friend. Not public.
Installed on iPhone as a home-screen web app (PWA), not an App Store app (decided).

## Run

- `npm run dev` (Vite), typecheck `npx tsc -b`, lint `npm run lint`.
- `npm test`: unit tests (Vitest, `src/*.test.ts`) + browser tests (Playwright, `tests/e2e`, iPhone
  viewport in WebKit and Chromium). Gemini is mocked in browser tests; no key needed.
- Deploy: `npm run deploy` (typecheck, unit tests, build with `BASE=/gym-tracker/`, push `dist` to
  the `gh-pages` branch). Live at https://collegecryps.github.io/gym-tracker/. No GitHub Actions:
  the gh token lacks `workflow` scope, so deploys are manual from this Mac.

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

## Gotchas

- Safari/WebKit can't reliably store Blobs in IndexedDB. Photos are stored as JPEG data URLs.
  Don't switch back to Blobs.

## Files

- `src/plan.ts` calorie/macro targets, adaptive maintenance, volume, progression.
- `src/ai.ts` Gemini calls (food + equipment) and photo shrinking.
- `src/db.ts` schema + backup.
