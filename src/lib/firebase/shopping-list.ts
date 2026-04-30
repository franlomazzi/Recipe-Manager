import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteField,
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

/**
 * Wrapper: try updateDoc first (fast field-mask patch), fall back to setDoc
 * if the document doesn't exist yet (first-ever shopping list write).
 */
async function patchOrCreate(
  userId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const ref = docRef(userId);
  const data = { ...fields, updatedAt: serverTimestamp() };
  try {
    await updateDoc(ref, data);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "not-found") {
      await setDoc(ref, { userId, ...data });
    } else {
      throw err;
    }
  }
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
  await patchOrCreate(userId, { checkedKeys });
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
  // Use dot-notation to patch only the affected week — avoids rewriting all weeks.
  await patchOrCreate(userId, {
    [`extraByWeek.${weekKey}`]: [...existing, newEntry],
  });
}

/** Remove a single extra entry by its id from a specific week */
export async function removeExtraEntry(
  userId: string,
  weekKey: string,
  entryId: string,
  currentByWeek: Record<string, ExtraRecipeEntry[]>
) {
  const filtered = (currentByWeek[weekKey] ?? []).filter((e) => e.id !== entryId);
  await patchOrCreate(userId, {
    [`extraByWeek.${weekKey}`]: filtered,
  });
}

export async function updateCustomItems(
  userId: string,
  customItems: CustomShoppingItem[]
) {
  await patchOrCreate(userId, { customItems });
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

  // Patch only the affected week via dot-notation.
  await patchOrCreate(userId, {
    [`oneOffByWeek.${weekKey}`]: weekMap,
  });
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

  const patch: Record<string, unknown> = {};
  let dirty = false;

  if (state.extraByWeek && legacyKey in state.extraByWeek) {
    if (!(weekKey in state.extraByWeek)) {
      patch[`extraByWeek.${weekKey}`] = state.extraByWeek[legacyKey];
    }
    patch[`extraByWeek.${legacyKey}`] = deleteField();
    dirty = true;
  }

  if (state.oneOffByWeek && legacyKey in state.oneOffByWeek) {
    if (!(weekKey in state.oneOffByWeek)) {
      patch[`oneOffByWeek.${weekKey}`] = state.oneOffByWeek[legacyKey];
    }
    patch[`oneOffByWeek.${legacyKey}`] = deleteField();
    dirty = true;
  }

  if (!dirty) return;
  await patchOrCreate(userId, patch);
}

export async function clearAllChecked(userId: string) {
  await patchOrCreate(userId, { checkedKeys: [] });
}
