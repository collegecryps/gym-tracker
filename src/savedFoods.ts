// Foods the user has eaten, kept separately from the food log so deleting a log entry doesn't
// lose them. Up to MAX_SAVED, most recently used first; the oldest drops off past that.

import { db, type Food } from './db'
import { MAX_SAVED, toSaved } from './foodCategories'

export { FOOD_CATEGORIES, MAX_SAVED, guessCategory } from './foodCategories'

/** Save (or refresh) a logged food, then drop the oldest past MAX_SAVED. */
export async function rememberFood(f: Food): Promise<void> {
  if (!f.name.trim() || f.name.trim() === 'Food') return
  await db.transaction('rw', db.savedFoods, async () => {
    await db.savedFoods.put(toSaved(f, Date.now()))
    const extra = (await db.savedFoods.count()) - MAX_SAVED
    if (extra > 0) await db.savedFoods.orderBy('lastUsed').limit(extra).delete()
  })
}
