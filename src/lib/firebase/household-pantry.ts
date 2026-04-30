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
import type { HouseholdPantryState } from "@/lib/types/household";

const HOUSEHOLDS = "households";
const PANTRY_STATE = "pantryState";
const PANTRY_DOC = "current";

function pantryRef(householdId: string) {
  return doc(getDb(), HOUSEHOLDS, householdId, PANTRY_STATE, PANTRY_DOC);
}

const EMPTY_STATE: HouseholdPantryState = {
  pantryItemIds: [],
  pantryCheckedByWeek: {},
  pantryAddedByWeek: {},
  pantryProcessedByWeek: {},
  pantryCheckedKeysByWeek: {},
};

export function emptyPantryState(): HouseholdPantryState {
  return {
    pantryItemIds: [],
    pantryCheckedByWeek: {},
    pantryAddedByWeek: {},
    pantryProcessedByWeek: {},
    pantryCheckedKeysByWeek: {},
  };
}

export function subscribeToHouseholdPantryState(
  householdId: string,
  callback: (state: HouseholdPantryState) => void
): Unsubscribe {
  return onSnapshot(pantryRef(householdId), (snap) => {
    if (!snap.exists()) {
      callback(emptyPantryState());
      return;
    }
    const data = snap.data() as Partial<HouseholdPantryState>;
    callback({ ...EMPTY_STATE, ...data });
  });
}

/**
 * Wrapper: try updateDoc first (fast field-mask patch), fall back to setDoc
 * if the document doesn't exist yet.
 */
async function patchPantryState(
  householdId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const ref = pantryRef(householdId);
  const data = { ...fields, updatedAt: serverTimestamp() };
  try {
    await updateDoc(ref, data);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "not-found") {
      await setDoc(ref, data);
    } else {
      throw err;
    }
  }
}

export async function setPantryItemIds(
  householdId: string,
  ids: string[]
): Promise<void> {
  await patchPantryState(householdId, { pantryItemIds: ids });
}

export async function addPantryItemId(
  householdId: string,
  current: string[],
  id: string
): Promise<void> {
  if (current.includes(id)) return;
  await setPantryItemIds(householdId, [...current, id]);
}

export async function removePantryItemId(
  householdId: string,
  current: string[],
  id: string
): Promise<void> {
  await setPantryItemIds(
    householdId,
    current.filter((x) => x !== id)
  );
}

export async function setPantryCheckedForWeek(
  householdId: string,
  weekKey: string,
  checkedIds: string[],
  _currentMap: Record<string, string[]>
): Promise<void> {
  // Dot-notation: patch only the affected week key.
  await patchPantryState(householdId, {
    [`pantryCheckedByWeek.${weekKey}`]: checkedIds,
  });
}

export async function commitPantryForWeek(
  householdId: string,
  weekKey: string,
  addedIds: string[],
  _currentAdded: Record<string, string[]>,
  _currentProcessed: Record<string, boolean>
): Promise<void> {
  await patchPantryState(householdId, {
    [`pantryAddedByWeek.${weekKey}`]: addedIds,
    [`pantryProcessedByWeek.${weekKey}`]: true,
  });
}

export async function reopenPantryForWeek(
  householdId: string,
  weekKey: string,
  _currentProcessed: Record<string, boolean>
): Promise<void> {
  await patchPantryState(householdId, {
    [`pantryProcessedByWeek.${weekKey}`]: deleteField(),
  });
}

/**
 * Toggle the checked state for a pantry-originated shopping list item key
 * within a specific week. Both household members share this state.
 */
export async function toggleSharedPantryCheckedKey(
  householdId: string,
  weekKey: string,
  key: string,
  currentMap: Record<string, string[]>
): Promise<void> {
  const existing = currentMap[weekKey] ?? [];
  const next = existing.includes(key)
    ? existing.filter((k) => k !== key)
    : [...existing, key];
  await patchPantryState(householdId, {
    [`pantryCheckedKeysByWeek.${weekKey}`]: next,
  });
}

/**
 * Best-effort migration: rename a legacy numeric-offset key to its ISO-week key
 * across the four pantry per-week records.
 */
export async function migratePantryWeekKey(
  householdId: string,
  legacyKey: string,
  weekKey: string,
  state: HouseholdPantryState
): Promise<void> {
  if (legacyKey === weekKey) return;

  const patch: Record<string, unknown> = {};
  let dirty = false;

  function migrate<T>(
    fieldPrefix: string,
    field: Record<string, T> | undefined
  ): void {
    if (!field || !(legacyKey in field)) return;
    if (!(weekKey in field)) {
      patch[`${fieldPrefix}.${weekKey}`] = field[legacyKey];
    }
    patch[`${fieldPrefix}.${legacyKey}`] = deleteField();
    dirty = true;
  }

  migrate("pantryAddedByWeek", state.pantryAddedByWeek);
  migrate("pantryCheckedByWeek", state.pantryCheckedByWeek);
  migrate("pantryProcessedByWeek", state.pantryProcessedByWeek);
  migrate("pantryCheckedKeysByWeek", state.pantryCheckedKeysByWeek);

  if (!dirty) return;
  await patchPantryState(householdId, patch);
}
