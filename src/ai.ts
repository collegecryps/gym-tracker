// Photo recognition via Google's Gemini API (free tier). Each person pastes their own free key
// in Settings; it is stored only on their phone.

export interface FoodGuess {
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  notes: string
}

export interface EquipmentGuess {
  equipment: string
  exercises: { name: string; muscle: string; secondary: string[]; cue: string }[]
}

async function ask<T>(key: string, model: string, image: string, prompt: string, schema: object): Promise<T> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(image)
  if (!m) throw new Error('Could not read photo')
  if (!key) throw new Error('Add your free Gemini key in Settings to use photo recognition.')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ inline_data: { mime_type: m[1], data: m[2] } }, { text: prompt }],
          },
        ],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
      }),
    },
  )
  if (res.status === 429) throw new Error('Free daily photo limit reached. Enter the numbers by hand or try later.')
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error?.message ?? `Photo recognition failed (${res.status})`)
  }
  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('No answer from the photo service. Try another photo.')
  return JSON.parse(text) as T
}

export function analyzeFood(key: string, model: string, image: string, hint: string): Promise<FoodGuess> {
  return ask<FoodGuess>(
    key,
    model,
    image,
    `You are a sports nutritionist. Estimate the nutrition of the food in this photo as one meal entry.
Judge portion size from plate, utensils, hands and packaging. If a nutrition label is visible, use it.
${hint ? `The user says: "${hint}". Trust this over what you see.` : ''}
Give a short name, total calories (kcal) and grams of protein, carbs and fat for everything shown.
In notes, list the items and portion sizes you assumed, in one sentence.`,
    {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        calories: { type: 'NUMBER' },
        protein: { type: 'NUMBER' },
        carbs: { type: 'NUMBER' },
        fat: { type: 'NUMBER' },
        notes: { type: 'STRING' },
      },
      required: ['name', 'calories', 'protein', 'carbs', 'fat', 'notes'],
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
