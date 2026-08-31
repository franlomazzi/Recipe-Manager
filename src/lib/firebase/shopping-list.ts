import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteField,
  arrayUnion,
  arrayRemove,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type {
  ShoppingListState,
  CustomShoppingItem,
  ExtraRecipeEntry,
  HiddenShoppingItem,
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
  weekKey: string,
  currentChecked: string[],
  key: string
) {
  const next = currentChecked.includes(key)
    ? currentChecked.filter((k) => k !== key)
    : [...currentChecked, key];
  await patchOrCreate(userId, { [`checkedKeysByWeek.${weekKey}`]: next });
}

/**
 * One-time migration: move the legacy global `checkedKeys` array into the
 * per-week `checkedKeysByWeek` map under the current ISO week, then clear the
 * legacy field. Without a week association the only reasonable home is the week
 * the user is shopping now. Safe to call repeatedly (no-op once cleared).
 */
export async function migrateGlobalCheckedKeys(
  userId: string,
  currentWeekKey: string,
  state: ShoppingListState
) {
  const legacy = state.checkedKeys ?? [];
  if (legacy.length === 0) return;
  // Merge into anything already recorded for the current week.
  const existing = state.checkedKeysByWeek?.[currentWeekKey] ?? [];
  const merged = Array.from(new Set([...existing, ...legacy]));
  await patchOrCreate(userId, {
    [`checkedKeysByWeek.${currentWeekKey}`]: merged,
    checkedKeys: [],
  });
}

/** Remove all extra (manually-added) recipes for a specific week. */
export async function clearExtraRecipesForWeek(
  userId: string,
  weekKey: string
): Promise<void> {
  await patchOrCreate(userId, { [`extraByWeek.${weekKey}`]: [] });
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
  weekKey: string,
  customItems: CustomShoppingItem[]
) {
  await patchOrCreate(userId, { [`customItemsByWeek.${weekKey}`]: customItems });
}

/**
 * One-time migration: move the legacy global `customItems` array into the
 * per-week `customItemsByWeek` map under the current ISO week, then clear the
 * legacy field. Without a week association the only reasonable home is the week
 * the user is shopping now. Safe to call repeatedly (no-op once cleared).
 */
export async function migrateGlobalCustomItems(
  userId: string,
  currentWeekKey: string,
  state: ShoppingListState
) {
  const legacy = state.customItems ?? [];
  if (legacy.length === 0) return;
  // Merge into anything already recorded for the current week.
  const existing = state.customItemsByWeek?.[currentWeekKey] ?? [];
  const merged = [...existing, ...legacy];
  await patchOrCreate(userId, {
    [`customItemsByWeek.${currentWeekKey}`]: merged,
    customItems: [],
  });
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

/** Clear the "Completed" record for a single week. */
export async function clearAllChecked(userId: string, weekKey: string) {
  await patchOrCreate(userId, { [`checkedKeysByWeek.${weekKey}`]: [] });
}

/**
 * Uncheck a specific set of item keys for a week, leaving every other checked
 * item intact. Used to reset only the items from this week's planned recipes
 * without disturbing extra-recipe, pantry, or custom-item checks.
 */
export async function uncheckKeysForWeek(
  userId: string,
  weekKey: string,
  currentChecked: string[],
  keysToUncheck: string[]
): Promise<void> {
  const remove = new Set(keysToUncheck);
  const next = currentChecked.filter((k) => !remove.has(k));
  if (next.length === currentChecked.length) return;
  await patchOrCreate(userId, { [`checkedKeysByWeek.${weekKey}`]: next });
}

export async function closeWeek(userId: string, weekKey: string): Promise<void> {
  await patchOrCreate(userId, { closedWeeks: arrayUnion(weekKey) });
}

export async function reopenWeek(userId: string, weekKey: string): Promise<void> {
  await patchOrCreate(userId, { closedWeeks: arrayRemove(weekKey) });
}

// ─── Individual pantry helpers ────────────────────────────────────────────────

export async function setIndividualPantryItemIds(
  userId: string,
  ids: string[]
): Promise<void> {
  await patchOrCreate(userId, { individualPantryItemIds: ids });
}

export async function addIndividualPantryItemId(
  userId: string,
  current: string[],
  id: string
): Promise<void> {
  if (current.includes(id)) return;
  await setIndividualPantryItemIds(userId, [...current, id]);
}

export async function removeIndividualPantryItemId(
  userId: string,
  current: string[],
  id: string
): Promise<void> {
  await setIndividualPantryItemIds(userId, current.filter((x) => x !== id));
}

export async function setIndividualPantryCheckedForWeek(
  userId: string,
  weekKey: string,
  checkedIds: string[]
): Promise<void> {
  await patchOrCreate(userId, {
    [`individualPantryCheckedByWeek.${weekKey}`]: checkedIds,
  });
}

export async function commitIndividualPantryForWeek(
  userId: string,
  weekKey: string,
  addedIds: string[]
): Promise<void> {
  await patchOrCreate(userId, {
    [`individualPantryAddedByWeek.${weekKey}`]: addedIds,
    [`individualPantryProcessedByWeek.${weekKey}`]: true,
  });
}

export async function excludeItemForWeek(
  userId: string,
  weekKey: string,
  itemKey: string,
  currentExclusions: string[]
): Promise<void> {
  if (currentExclusions.includes(itemKey)) return;
  await patchOrCreate(userId, {
    [`exclusionsByWeek.${weekKey}`]: [...currentExclusions, itemKey],
  });
}

/**
 * Permanently hide an item from the shopping list (every week). Used for
 * "ingredients" that aren't groceries at all, e.g. a "Saturday Cheat Meal"
 * placeholder. The whole array is rewritten rather than patched with
 * `arrayUnion` because item keys are free-text and can contain dots, which
 * Firestore would read as field-path separators.
 */
export async function hideShoppingItem(
  userId: string,
  current: HiddenShoppingItem[],
  item: HiddenShoppingItem
): Promise<void> {
  if (current.some((h) => h.key === item.key)) return;
  await patchOrCreate(userId, { hiddenItems: [...current, item] });
}

/** Unhide a previously hidden item so it returns to the shopping list. */
export async function unhideShoppingItem(
  userId: string,
  current: HiddenShoppingItem[],
  key: string
): Promise<void> {
  const next = current.filter((h) => h.key !== key);
  if (next.length === current.length) return;
  await patchOrCreate(userId, { hiddenItems: next });
}

export async function removeIndividualPantryItemFromWeek(
  userId: string,
  weekKey: string,
  libraryId: string,
  currentAddedIds: string[]
): Promise<void> {
  await patchOrCreate(userId, {
    [`individualPantryAddedByWeek.${weekKey}`]: currentAddedIds.filter((id) => id !== libraryId),
  });
}

export async function reopenIndividualPantryForWeek(
  userId: string,
  weekKey: string
): Promise<void> {
  await patchOrCreate(userId, {
    [`individualPantryProcessedByWeek.${weekKey}`]: deleteField(),
  });
}

/**
 * Undo the most recent individual pantry commit for a week. Removes the items
 * from the shopping list and clears the processed flag. The user's per-key
 * `checkedKeys` are left untouched — those are personal and don't need cleanup
 * since they target stale `ipantry:` keys harmlessly.
 */
export async function undoLastIndividualPantryCommit(
  userId: string,
  weekKey: string
): Promise<void> {
  await patchOrCreate(userId, {
    [`individualPantryAddedByWeek.${weekKey}`]: deleteField(),
    [`individualPantryProcessedByWeek.${weekKey}`]: deleteField(),
  });
}
