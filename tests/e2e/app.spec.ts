import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const PHOTO = path.join(import.meta.dirname, '../fixtures/photo.jpg')

async function onboard(page: Page) {
  await page.goto('/')
  await page.getByPlaceholder('Name').fill('Emmet')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click() // sex: male
  await page.getByPlaceholder('Age').fill('24')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByPlaceholder('ft').fill('6')
  await page.getByPlaceholder('in').fill('0')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByPlaceholder('lb').fill('175')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click() // activity default
  await page.getByRole('button', { name: 'Build my plan' }).click()
  await expect(page.getByText('750 / 3150').or(page.getByText('0 / 3150'))).toBeVisible()
}

/** Fake Gemini. Returns the requests it saw so tests can check what was sent. */
async function mockGemini(page: Page, answer: object | number) {
  const seen: { key: string | null; body: any }[] = []
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request()
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
    }
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    seen.push({ key: req.headers()['x-goog-api-key'] ?? null, body: req.postDataJSON() })
    if (typeof answer === 'number') return route.fulfill({ status: answer, headers: cors, json: { error: { message: 'quota' } } })
    return route.fulfill({
      headers: cors,
      json: { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] },
    })
  })
  return seen
}

async function setKey(page: Page, key = 'test-key-123') {
  await page.locator('.tabbar').getByText('More').click()
  await page.getByPlaceholder('Paste key').fill(key)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Saved ✓' })).toBeVisible()
}

test('onboarding builds a plan with the right targets', async ({ page }) => {
  await onboard(page)
  await expect(page.locator('.big-number')).toHaveText(/^3150\s*calories left$/)
  await expect(page.getByText('0 / 175g')).toBeVisible() // protein
  await expect(page.getByText('0 / 475g')).toBeVisible() // carbs
  await expect(page.getByText('0 / 61g')).toBeVisible() // fat
})

test('onboarding blocks bad input', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  await page.getByPlaceholder('Name').fill('A')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByPlaceholder('Age').fill('3')
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
})

test('add, edit and delete food by hand', async ({ page }) => {
  await onboard(page)
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '+ Enter manually' }).click()
  await page.getByPlaceholder('e.g. Chicken burrito bowl').fill('Chicken rice bowl')
  const n = page.locator('.grid4 input')
  await n.nth(0).fill('750')
  await n.nth(1).fill('55')
  await n.nth(2).fill('80')
  await n.nth(3).fill('18')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.big-number')).toHaveText(/^2400\s*calories left$/)

  // Edit
  await page.getByText('Chicken rice bowl').click()
  await n.nth(0).fill('900')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.big-number')).toHaveText(/^2250\s*calories left$/)

  // Recent foods appear as one-tap shortcuts
  await page.getByRole('button', { name: '+ Enter manually' }).click()
  await page.locator('.chip', { hasText: 'Chicken rice bowl' }).click()
  await expect(n.nth(0)).toHaveValue('900')
  await page.getByRole('button', { name: 'Close' }).click()

  // Delete
  await page.getByText('Chicken rice bowl').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.big-number')).toHaveText(/^3150\s*calories left$/)
})

test('going over calories shows "over"', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: '+ Enter manually' }).click()
  await page.locator('.grid4 input').nth(0).fill('3400')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('250')).toBeVisible()
  await expect(page.getByText('calories over')).toBeVisible()
})

test('food photo: estimate, then change the numbers before saving', async ({ page }) => {
  const seen = await mockGemini(page, {
    name: 'Steak and potatoes',
    calories: 812.4,
    protein: 61.2,
    carbs: 55,
    fat: 38,
    notes: '8 oz sirloin, 1 medium potato',
  })
  await onboard(page)
  await setKey(page)
  await page.locator('.tabbar').getByText('Food').click()
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await page.getByPlaceholder(/Optional: details/).fill('8 oz steak')
  await page.getByRole('button', { name: 'Estimate from photo' }).click()

  const n = page.locator('.grid4 input')
  await expect(n.nth(0)).toHaveValue('812')
  await expect(n.nth(1)).toHaveValue('61')
  await expect(page.getByPlaceholder('e.g. Chicken burrito bowl')).toHaveValue('Steak and potatoes')
  await expect(page.getByText('Assumed: 8 oz sirloin, 1 medium potato')).toBeVisible()

  // What was sent: the user's key, the photo, and the hint
  expect(seen).toHaveLength(1)
  expect(seen[0].key).toBe('test-key-123')
  const parts = seen[0].body.contents[0].parts
  expect(parts[0].inline_data.mime_type).toBe('image/jpeg')
  expect(parts[0].inline_data.data.length).toBeGreaterThan(1000)
  expect(parts[1].text).toContain('8 oz steak')

  // User overrides the AI
  await n.nth(0).fill('700')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.list-item', { hasText: 'Steak and potatoes' })).toContainText('700')
  await expect(page.locator('.list-item', { hasText: 'Steak and potatoes' })).toContainText('photo estimate')
  await expect(page.locator('.list-item img.thumb')).toBeVisible()
})

test('food photo without a key explains what to do', async ({ page }) => {
  await onboard(page)
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await page.getByRole('button', { name: 'Estimate from photo' }).click()
  await expect(page.getByText(/Add your free Gemini key in Settings/)).toBeVisible()
})

test('food photo at the free daily limit says so', async ({ page }) => {
  await mockGemini(page, 429)
  await onboard(page)
  await setKey(page)
  await page.locator('.tabbar').getByText('Food').click()
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await page.getByRole('button', { name: 'Estimate from photo' }).click()
  await expect(page.getByText(/Free daily photo limit reached/)).toBeVisible()
})

test('log sets and see weekly volume', async ({ page }) => {
  await onboard(page)
  await page.locator('.tabbar').getByText('Lift').click()
  await page.getByRole('button', { name: '+ Add exercise' }).click()
  await page.locator('.modal input').fill('bench')
  await page.locator('.modal .list-item', { hasText: /^Bench Press/ }).click()
  await page.getByLabel('Weight lb').fill('185')
  await page.getByLabel('Reps').fill('8')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Log set' }).click()
  // A too-easy set (4+ reps left) doesn't count as hard
  await page.getByRole('button', { name: '4+' }).click()
  await page.getByRole('button', { name: 'Log set' }).click()
  await expect(page.getByText('Set 4')).toBeVisible()
  await page.getByRole('button', { name: 'Delete set' }).first().click()
  await expect(page.getByText('Set 4')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close' }).click()

  const row = (m: string) => page.locator('.vol-row', { hasText: m })
  await expect(row('Chest').locator('.vol-num')).toHaveText('2') // deleted 1 hard, 1 easy not counted
  await expect(row('Triceps').locator('.vol-num')).toHaveText('1')
  await expect(row('Chest').locator('.vol-freq')).toHaveText('1d')
  await expect(page.locator('.list-item', { hasText: 'Bench Press' })).toContainText('3 sets')
})

test('add a custom exercise', async ({ page }) => {
  await onboard(page)
  await page.locator('.tabbar').getByText('Lift').click()
  await page.getByRole('button', { name: '+ Add exercise' }).click()
  await page.locator('.modal input').fill('Pendulum Squat')
  await page.locator('.modal select').selectOption('Quads')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.modal h2')).toHaveText('Pendulum Squat')
  await page.getByLabel('Weight lb').fill('90')
  await page.getByLabel('Reps').fill('10')
  await page.getByRole('button', { name: 'Log set' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.vol-row', { hasText: 'Quads' }).locator('.vol-num')).toHaveText('1')
})

test('scan a machine and log the suggested exercise', async ({ page }) => {
  const seen = await mockGemini(page, {
    equipment: 'Cable stack with lat bar',
    exercises: [
      { name: 'Lat Pulldown', muscle: 'Back', secondary: ['Biceps'], cue: 'Pull elbows to your sides.' },
      { name: 'Straight-Arm Pulldown', muscle: 'Back', secondary: [], cue: 'Keep arms straight.' },
    ],
  })
  await onboard(page)
  await setKey(page)
  await page.locator('.tabbar').getByText('Lift').click()
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await page.getByRole('button', { name: 'What is this?' }).click()
  await expect(page.getByText('Cable stack with lat bar')).toBeVisible()
  expect(seen[0].body.generationConfig.responseSchema.properties.exercises).toBeTruthy()

  // An exercise not in the built-in list gets saved as a custom one
  await page.getByText('Straight-Arm Pulldown').click()
  await expect(page.locator('.modal h2')).toHaveText('Straight-Arm Pulldown')
  await page.getByLabel('Weight lb').fill('50')
  await page.getByLabel('Reps').fill('12')
  await page.getByRole('button', { name: 'Log set' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: '+ Add exercise' }).click()
  await page.locator('.modal input').fill('straight')
  await expect(page.locator('.modal .list-item', { hasText: 'Straight-Arm Pulldown' })).toBeVisible()
})

test('progression advice uses last session', async ({ page }) => {
  await onboard(page)
  // Put a set from 3 days ago straight into the database
  await page.evaluate(async () => {
    const req = indexedDB.open('gym-tracker')
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)))
    const d = new Date(Date.now() - 3 * 864e5)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const tx = db.transaction('sets', 'readwrite')
    tx.objectStore('sets').add({ date, time: d.getTime(), exercise: 'Squat', muscle: 'Quads', weightLb: 225, reps: 12, rir: 1 })
    await new Promise((r) => (tx.oncomplete = r))
    db.close()
  })
  await page.locator('.tabbar').getByText('Lift').click()
  await page.getByRole('button', { name: '+ Add exercise' }).click()
  await page.locator('.modal input').fill('squat')
  await page.locator('.modal .list-item', { hasText: /^Squat/ }).click()
  await expect(page.locator('.tip')).toContainText('230 lb')
  await expect(page.getByLabel('Weight lb')).toHaveValue('225') // prefilled from last time
})

test('weigh in and update today', async ({ page }) => {
  await onboard(page)
  await page.locator('.tabbar').getByText('Weight').click()
  await page.locator('.big-input').fill('176.2')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.list-item', { hasText: '176.2' })).toBeVisible()
  await page.locator('.big-input').fill('176.8')
  await page.getByRole('button', { name: 'Update' }).click()
  await expect(page.locator('.list-item')).toHaveCount(1)
  await expect(page.locator('.list-item')).toContainText('176.8')
  await expect(page.getByText('Weigh in most mornings')).toBeVisible()
})

test('settings changes update the plan', async ({ page }) => {
  await onboard(page)
  await page.locator('.tabbar').getByText('More').click()
  await page.locator('select').nth(1).selectOption('0.5')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.tabbar').getByText('Food').click()
  await expect(page.getByText(/^3260 calories left|3260/).first()).toBeVisible()
})

test('backup and restore round-trip', async ({ page }) => {
  await onboard(page)
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: '+ Enter manually' }).click()
  await page.getByPlaceholder('e.g. Chicken burrito bowl').fill('Oats')
  await page.locator('.grid4 input').nth(0).fill('400')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.locator('.tabbar').getByText('More').click()
  // Force the download path (desktop browsers can't share files)
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined }))
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save backup' }).click()])
  const file = await dl.path()
  expect(dl.suggestedFilename()).toMatch(/^gym-tracker-emmet-\d{4}-\d{2}-\d{2}\.json$/)

  // Wipe the food, then restore
  await page.locator('.tabbar').getByText('Food').click()
  await page.getByText('Oats').click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('Oats')).toHaveCount(0)

  await page.locator('.tabbar').getByText('More').click()
  await page.locator('input[type=file][accept*=json]').setInputFiles(file)
  await expect(page.getByText('Backup restored.')).toBeVisible()
  await page.locator('.tabbar').getByText('Food').click()
  await expect(page.getByText('Oats')).toBeVisible()
})

test('restore rejects a file that is not a backup', async ({ page }) => {
  await onboard(page)
  page.on('dialog', (d) => d.accept())
  await page.locator('.tabbar').getByText('More').click()
  await page.locator('input[type=file][accept*=json]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') })
  await expect(page.getByText('Not a backup file from this app')).toBeVisible()
})

test('science sources are listed with links', async ({ page }) => {
  await onboard(page)
  await page.locator('.tabbar').getByText('More').click()
  await expect(page.locator('details')).toHaveCount(7)
  await page.getByText('10–20 hard sets per muscle per week').click()
  await expect(page.getByRole('link', { name: /Schoenfeld, Ogborn & Krieger \(2017\)/ })).toBeVisible()
})

test('installable on the home screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/icon-180.png')
  await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute('content', 'yes')
})
