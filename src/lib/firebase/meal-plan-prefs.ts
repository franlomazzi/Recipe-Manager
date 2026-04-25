import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";

export interface MealPlanPrefs {
  forceShowCategories: string[];
}

const COLLECTION = "user_preferences";

function docRef(uid: string) {
  return doc(getDb(), COLLECTION, `${uid}_meal_plan`);
}

export async function getMealPlanPrefs(uid: string): Promise<MealPlanPrefs> {
  const snap = await getDoc(docRef(uid));
  if (snap.exists()) return snap.data() as MealPlanPrefs;
  return { forceShowCategories: [] };
}

export function subscribeMealPlanPrefs(
  uid: string,
  callback: (prefs: MealPlanPrefs) => void
): Unsubscribe {
  return onSnapshot(docRef(uid), (snap) => {
    if (snap.exists()) {
      callback(snap.data() as MealPlanPrefs);
    } else {
      callback({ forceShowCategories: [] });
    }
  });
}

export async function setForceShowCategory(
  uid: string,
  category: string,
  on: boolean
): Promise<void> {
  const current = await getMealPlanPrefs(uid);
  const set = new Set(current.forceShowCategories);
  if (on) {
    set.add(category);
  } else {
    set.delete(category);
  }
  await setDoc(docRef(uid), { forceShowCategories: Array.from(set) });
}
