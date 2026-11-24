// Photo recognition and recipe ideas via Google's Gemini API (free tier). Each person pastes their own free key
// in Settings; it is stored only on their phone.

export interface FoodGuess {
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  notes: string
  category: string
}

export interface EquipmentGuess {
  equipment: string
  exercises: { name: string; muscle: string; secondary: string[]; cue: string }[]
}

// Backup model when the chosen one is overloaded or out of free quota. An alias, so it keeps
// pointing at Google's newest Flash-Lite model without app updates.
const FALLBACK_MODEL = 'gemini-flash-lite-latest'
// Waits before each retry of the same model when Google is busy (503/500).
const RETRY_WAITS_MS = [1500, 4000]

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

class GeminiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function callModel(key: string, model: string, body: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    throw new GeminiError(err?.error?.message ?? `Photo recognition failed (${res.status})`, res.status)
  }
  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new GeminiError('No answer from the photo service. Try another photo.', 0)
  return text
}

async function ask<T>(key: string, model: string, image: string | null, prompt: string, schema: object, temperature = 0.2): Promise<T> {
  const m = image === null ? null : /^data:([^;]+);base64,(.+)$/.exec(image)
  if (image !== null && !m) throw new Error('Could not read photo')
  if (!key) throw new Error(`Add your free Gemini key in Settings to use ${image === null ? 'recipe ideas' : 'photo recognition'}.`)
  const parts = m ? [{ inline_data: { mime_type: m[1], data: m[2] } }, { text: prompt }] : [{ text: prompt }]
  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature },
  })

  const models = [...new Set([model.trim() || FALLBACK_MODEL, FALLBACK_MODEL])]
  let last: GeminiError | null = null
  for (const [i, name] of models.entries()) {
    for (let attempt = 0; ; attempt++) {
      try {
        return JSON.parse(await callModel(key, name, body)) as T
      } catch (e) {
        if (!(e instanceof GeminiError)) throw e
        // Bad key or bad request: switching models won't help.
        if (e.status === 400 || e.status === 401 || e.status === 403) throw e
        last = e
        const busy = e.status === 503 || e.status === 500
        if (busy && attempt < RETRY_WAITS_MS.length) {
          await wait(RETRY_WAITS_MS[attempt])
          continue
        }
        // 429 (this model's free limit), 404 (model retired) or still busy: try the backup model.
        if (i < models.length - 1) break
        if (e.status === 429)
          throw new Error(image === null ? 'Free daily Gemini limit reached. Try again later.' : 'Free daily photo limit reached. Enter the numbers by hand or try later.')
        if (busy)
          throw new Error(
            image === null
              ? "Google's AI service is busy right now. Try again in a minute."
              : "Google's photo service is busy right now. Try again in a minute, or enter the numbers by hand.",
          )
        throw e
      }
    }
  }
  throw last ?? new Error('Photo recognition failed')
}

export function analyzeFood(key: string, model: string, image: string, hint: string, categories: readonly string[]): Promise<FoodGuess> {
  return ask<FoodGuess>(
    key,
    model,
    image,
    `You are a sports nutritionist. Estimate the nutrition of the food in this photo as one meal entry.
Judge portion size from plate, utensils, hands and packaging. If a nutrition label is visible, use it.
${hint ? `The user says: "${hint}". Trust this over what you see.` : ''}
Give a short name, total calories (kcal) and grams of protein, carbs and fat for everything shown.
In notes, list the items and portion sizes you assumed, in one sentence.
For category, pick the best fit from: ${categories.join(', ')}. A mixed plate or restaurant dish is "Meals".`,
    {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        calories: { type: 'NUMBER' },
        protein: { type: 'NUMBER' },
        carbs: { type: 'NUMBER' },
        fat: { type: 'NUMBER' },
        notes: { type: 'STRING' },
        category: { type: 'STRING', enum: [...categories] },
      },
      required: ['name', 'calories', 'protein', 'carbs', 'fat', 'notes', 'category'],
    },
  )
}

export function analyzeEquipment(key: string, model: string, image: string, muscles: readonly string[]): Promise<EquipmentGuess> {
  return ask<EquipmentGuess>(
    key,
    model,
    image,
    `Identify the gym machine or equipment in this photo. List up to 4 exercises done on it that are
best for building muscle size, most useful first. Use common exercise names (e.g. "Lat Pulldown",
"Seated Cable Row"). For each, give the primary muscle and any secondary muscles, each chosen from:
${muscles.join(', ')}. Add a one-sentence form cue.`,
    {
      type: 'OBJECT',
      properties: {
        equipment: { type: 'STRING' },
        exercises: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              muscle: { type: 'STRING', enum: [...muscles] },
              secondary: { type: 'ARRAY', items: { type: 'STRING', enum: [...muscles] } },
              cue: { type: 'STRING' },
            },
            required: ['name', 'muscle', 'secondary', 'cue'],
          },
        },
      },
      required: ['equipment', 'exercises'],
    },
  )
}

export interface Macros {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export interface Recipe extends Macros {
  name: string
  meal: string
  minutes: number
  ingredients: string[]
  steps: string[]
}

/** Meals that together fill what's left of today's targets. */
export function suggestRecipes(key: string, model: string, left: Macros, request: string, avoid: string[]): Promise<{ recipes: Recipe[] }> {
  const count = left.calories > 1600 ? 3 : left.calories > 800 ? 2 : 1
  return ask<{ recipes: Recipe[] }>(
    key,
    model,
    null,
    `You are a sports nutritionist who cooks. Someone lifting weights still needs to eat, today:
${Math.round(left.calories)} kcal, ${Math.round(left.protein)} g protein, ${Math.round(left.carbs)} g carbs, ${Math.round(left.fat)} g fat.
Suggest ${count} simple, tasty recipe${count > 1 ? 's' : ''} that ${count > 1 ? 'together add up' : 'adds up'} as close as possible to those numbers. Protein matters most.
Use everyday grocery-store ingredients and keep each to 30 minutes or less where possible.
${request ? `They said: "${request}". Follow this.` : ''}
${avoid.length ? `Don't repeat these: ${avoid.join(', ')}.` : ''}
Give exact amounts for every ingredient (grams, cups, oz or count) so the macros are right for one serving.
For each recipe give: name, meal (Breakfast, Lunch, Dinner or Snack), minutes, ingredients, short steps,
and its calories and grams of protein, carbs and fat for the whole serving.`,
    {
      type: 'OBJECT',
      properties: {
        recipes: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              meal: { type: 'STRING' },
              minutes: { type: 'NUMBER' },
              ingredients: { type: 'ARRAY', items: { type: 'STRING' } },
              steps: { type: 'ARRAY', items: { type: 'STRING' } },
              calories: { type: 'NUMBER' },
              protein: { type: 'NUMBER' },
              carbs: { type: 'NUMBER' },
              fat: { type: 'NUMBER' },
            },
            required: ['name', 'meal', 'minutes', 'ingredients', 'steps', 'calories', 'protein', 'carbs', 'fat'],
          },
        },
      },
      required: ['recipes'],
    },
    0.8,
  )
}

/** Shrink a camera photo to a small JPEG data URL: faster upload, smaller storage. */
export async function shrinkImage(file: Blob, maxSide = 1024, quality = 0.8): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas.toDataURL('image/jpeg', quality)
}
