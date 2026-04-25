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
  weekKey: string,
  entry: Omit<ExtraRecipeEntry, "id">,
  currentByWeek: Record<string, ExtraRecipeEntry[]>
) {
  const existing = currentByWeek[weekKey] ?? [];
  const newEntry: ExtraRecipeEntry = { ...entry, id: crypto.randomUUID() };
  const updated = { ...currentByWeek, [weekKey]: [...existing, newEntry] };
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), extraByWeek: updated },
    { merge: true }
  );
}

/** Remove a single extra entry by its id from a specific week */
export async function removeExtraEntry(
  userId: string,
  weekKey: string,
  entryId: string,
  currentByWeek: Record<string, ExtraRecipeEntry[]>
) {
  const updated = {
    ...currentByWeek,
    [weekKey]: (currentByWeek[weekKey] ?? []).filter((e) => e.id !== entryId),
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
  weekKey: string,
  itemKey: string,
  meta: OneOffMeta,
  currentByWeek: Record<string, Record<string, OneOffMeta>>
) {
  const weekMap = { ...(currentByWeek[weekKey] ?? {}) };

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

  const updated = { ...currentByWeek, [weekKey]: weekMap };
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), oneOffByWeek: updated },
    { merge: true }
  );
}

/**
 * Best-effort migration: copy a legacy numeric-offset key to its ISO-week key
 * across all per-week records on the shopping list doc, then delete the legacy
 * entry. Safe to call multiple times (no-op if nothing to migrate).
 */
export async function migrateWeekKey(
  userId: string,
  legacyKey: string,
  weekKey: string,
  state: ShoppingListState
) {
  if (legacyKey === weekKey) return;

  const patch: Partial<ShoppingListState> = {};
  let dirty = false;

  function migrate<T>(field: Record<string, T> | undefined): Record<string, T> | null {
    if (!field) return null;
    if (!(legacyKey in field)) return null;
    const next = { ...field };
    if (!(weekKey in next)) {
      next[weekKey] = next[legacyKey];
    }
    delete next[legacyKey];
    return next;
  }

  const extra = migrate(state.extraByWeek);
  if (extra) { patch.extraByWeek = extra; dirty = true; }
  const oneOff = migrate(state.oneOffByWeek);
  if (oneOff) { patch.oneOffByWeek = oneOff; dirty = true; }

  if (!dirty) return;
  await setDoc(docRef(userId), { ...baseFields(userId), ...patch }, { merge: true });
}

export async function clearAllChecked(userId: string) {
  await setDoc(
    docRef(userId),
    { ...baseFields(userId), checkedKeys: [] },
    { merge: true }
  );
}
