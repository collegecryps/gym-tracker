// Food categories and saved-food helpers. Pure: no database access (db.ts imports this).

import type { Food, SavedFood } from './db'

export const MAX_SAVED = 40

export const FOOD_CATEGORIES = [
  'Meals',
  'Meat & Fish',
  'Eggs & Dairy',
  'Grains & Carbs',
  'Fruit & Veggies',
  'Snacks & Sweets',
  'Shakes & Drinks',
  'Other',
] as const

// First match wins, so specific phrases come before general ones ("protein shake" before "protein").
const KEYWORDS: [RegExp, string][] = [
  [/shake|smoothie|coffee|latte|juice|soda|gatorade|drink|tea\b|water|beer|seltzer|energy/, 'Shakes & Drinks'],
  [/bowl|burrito|sandwich|sub\b|pizza|burger|pasta|spaghetti|salad|stir.?fry|wrap|taco|quesadilla|chipotle|\bmeal\b|plate|curry|soup|chili|ramen|sushi|nugget|fries/, 'Meals'],
  [/chicken|beef|steak|turkey|pork|salmon|tuna|fish|shrimp|ham\b|bacon|sausage|jerky|ground|meat|tilapia|cod\b|lamb/, 'Meat & Fish'],
  [/egg|yogurt|yoghurt|cheese|milk|cottage|whey|casein|butter\b/, 'Eggs & Dairy'],
  [/rice|oat|bread|bagel|toast|cereal|potato|tortilla|granola|noodle|quinoa|pancake|waffle|muffin|grits|cream of rice/, 'Grains & Carbs'],
  [/apple|banana|berr|orange|grape|fruit|mango|pineapple|melon|peach|pear|broccoli|veg|spinach|carrot|avocado|lettuce|pepper|cucumber|tomato|bean|corn|green/, 'Fruit & Veggies'],
  [/bar\b|bars\b|chip|cookie|candy|chocolate|ice cream|popcorn|pretzel|nut|peanut|almond|cracker|donut|cake|brownie|gummy|snack|trail mix/, 'Snacks & Sweets'],
]

export function guessCategory(name: string): string {
  const n = name.toLowerCase()
  return KEYWORDS.find(([re]) => re.test(n))?.[1] ?? 'Other'
}

export function toSaved(f: Pick<Food, 'name' | 'calories' | 'protein' | 'carbs' | 'fat' | 'category'>, lastUsed: number): SavedFood {
  return {
    id: f.name.trim().toLowerCase(),
    name: f.name.trim(),
    calories: f.calories,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    category: f.category ?? guessCategory(f.name),
    lastUsed,
  }
}
