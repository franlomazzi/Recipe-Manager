import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type {
  ShoppingListState,
  CustomShoppingItem,
  ExtraRecipeEntry,
} from "@/lib/types/shopping-list";
import type { OneOffMeta } from "@/lib/types/shopping-organization";

const COLLECTION = "shoppingLists";

function docRef(userId: string) {
  return doc(getDb(), COLLECTION, userId);
}

function baseFields(userId: string) {
  return { userId, updatedAt: serverTimestamp() };
}

export function subscribeToShoppingListState(
  userId: string,
  callback: (state: ShoppingListState | null) => void
): Unsubscribe {
  return onSnapshot(docRef(userId), (snap) => {
    callback(snap.exists() ? (snap.data() as ShoppingListState) : null);
  });
}

export async function toggleCheckedKey(
  userId: string,
  currentChecked: string[],
  key: string
) {
  const checkedKeys = currentChecked.includes(key)
    ? currentChecked.filter((k) => k !== key)
    : [...currentChecked, key];
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), checkedKeys },
    { merge: true }
  );
}

/** Add a recipe entry to a specific week (allows duplicates — use servingMultiplier to scale) */
export async function addRecipeToWeek(
  userId: string,
  weekIndex: number,
  entry: Omit<ExtraRecipeEntry, "id">,
  currentByWeek: Record<string, ExtraRecipeEntry[]>
) {
  const key = String(weekIndex);
  const existing = currentByWeek[key] ?? [];
  const newEntry: ExtraRecipeEntry = { ...entry, id: crypto.randomUUID() };
  const updated = { ...currentByWeek, [key]: [...existing, newEntry] };
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), extraByWeek: updated },
    { merge: true }
  );
}

/** Remove a single extra entry by its id from a specific week */
export async function removeExtraEntry(
  userId: string,
  weekIndex: number,
  entryId: string,
  currentByWeek: Record<string, ExtraRecipeEntry[]>
) {
  const key = String(weekIndex);
  const updated = {
    ...currentByWeek,
    [key]: (currentByWeek[key] ?? []).filter((e) => e.id !== entryId),
  };
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), extraByWeek: updated },
    { merge: true }
  );
}

export async function updateCustomItems(
  userId: string,
  customItems: CustomShoppingItem[]
) {
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), customItems },
    { merge: true }
  );
}

/**
 * Set a one-off metadata override for a free-text/unlinked item in a specific week.
 * Pass `null` for individual fields to clear them; pass an empty object to remove the override entirely.
 */
export async function setOneOffMeta(
  userId: string,
  weekIndex: number,
  itemKey: string,
  meta: OneOffMeta,
  currentByWeek: Record<string, Record<string, OneOffMeta>>
) {
  const wk = String(weekIndex);
  const weekMap = { ...(currentByWeek[wk] ?? {}) };

  // Strip undefined values — Firestore rejects them
  const cleaned: OneOffMeta = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined) (cleaned as Record<string, unknown>)[k] = v;
  }

  if (Object.keys(cleaned).length === 0) {
    delete weekMap[itemKey];
  } else {
    weekMap[itemKey] = cleaned;
  }

  const updated = { ...currentByWeek, [wk]: weekMap };
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), oneOffByWeek: updated },
    { merge: true }
  );
}

export async function clearAllChecked(userId: string) {
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), checkedKeys: [] },
    { merge: true }
  );
}
