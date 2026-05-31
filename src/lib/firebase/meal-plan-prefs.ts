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
  /** When on, a category slot can hold multiple recipes ("components"). */
  multiRecipePerMeal?: boolean;
}

const COLLECTION = "user_preferences";

const DEFAULT_PREFS: MealPlanPrefs = {
  forceShowCategories: [],
  multiRecipePerMeal: false,
};

function docRef(uid: string) {
  return doc(getDb(), COLLECTION, `${uid}_meal_plan`);
}

export async function getMealPlanPrefs(uid: string): Promise<MealPlanPrefs> {
  const snap = await getDoc(docRef(uid));
  if (snap.exists()) return { ...DEFAULT_PREFS, ...snap.data() } as MealPlanPrefs;
  return { ...DEFAULT_PREFS };
}

export function subscribeMealPlanPrefs(
  uid: string,
  callback: (prefs: MealPlanPrefs) => void
): Unsubscribe {
  return onSnapshot(docRef(uid), (snap) => {
    if (snap.exists()) {
      callback({ ...DEFAULT_PREFS, ...snap.data() } as MealPlanPrefs);
    } else {
      callback({ ...DEFAULT_PREFS });
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
  await setDoc(
    docRef(uid),
    { forceShowCategories: Array.from(set) },
    { merge: true }
  );
}

export async function setMultiRecipePerMeal(
  uid: string,
  on: boolean
): Promise<void> {
  await setDoc(docRef(uid), { multiRecipePerMeal: on }, { merge: true });
}
