import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { getDb } from "./config";

// Recipe-Manager-only cache of the AI "combined plate" (photo + creative name)
// for a *set* of recipes eaten together as one meal. Keyed by the sorted set of
// mealIds so the same combination (e.g. steak + salad + potatoes) is generated
// once and reused across every day/plan it appears in. The food tracking app
// never reads this collection.

const COLLECTION = "recipe_meal_combos";

export interface MealCombo {
  id: string;
  userId: string;
  mealIds: string[];
  name: string;
  imageURL: string;
  imageStoragePath: string;
  createdAt?: Timestamp;
}

/** Stable key for a set of recipes, order-independent. */
export function comboKeyFor(mealIds: string[]): string {
  return [...mealIds].filter(Boolean).sort().join("_");
}

/** Short, deterministic FNV-1a hash so the doc id stays bounded. */
function hashKey(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function comboDocId(uid: string, mealIds: string[]): string {
  return `${uid}_${hashKey(comboKeyFor(mealIds))}`;
}

export async function getMealCombo(
  uid: string,
  mealIds: string[]
): Promise<MealCombo | null> {
  const snap = await getDoc(doc(getDb(), COLLECTION, comboDocId(uid, mealIds)));
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id } as MealCombo;
}

export async function saveMealCombo(
  uid: string,
  mealIds: string[],
  data: { name: string; imageURL: string; imageStoragePath: string }
): Promise<MealCombo> {
  const id = comboDocId(uid, mealIds);
  const combo = {
    id,
    userId: uid,
    mealIds: [...mealIds].filter(Boolean).sort(),
    name: data.name,
    imageURL: data.imageURL,
    imageStoragePath: data.imageStoragePath,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(getDb(), COLLECTION, id), combo);
  return combo as unknown as MealCombo;
}
