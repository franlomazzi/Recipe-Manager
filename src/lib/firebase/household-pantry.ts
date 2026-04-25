import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
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

async function patchPantryState(
  householdId: string,
  patch: Partial<HouseholdPantryState>
) {
  await setDoc(
    pantryRef(householdId),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true }
  );
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
  currentMap: Record<string, string[]>
): Promise<void> {
  const updated = { ...currentMap, [weekKey]: checkedIds };
  await patchPantryState(householdId, { pantryCheckedByWeek: updated });
}

export async function commitPantryForWeek(
  householdId: string,
  weekKey: string,
  addedIds: string[],
  currentAdded: Record<string, string[]>,
  currentProcessed: Record<string, boolean>
): Promise<void> {
  await patchPantryState(householdId, {
    pantryAddedByWeek: { ...currentAdded, [weekKey]: addedIds },
    pantryProcessedByWeek: { ...currentProcessed, [weekKey]: true },
  });
}

export async function reopenPantryForWeek(
  householdId: string,
  weekKey: string,
  currentProcessed: Record<string, boolean>
): Promise<void> {
  const updated = { ...currentProcessed };
  delete updated[weekKey];
  await patchPantryState(householdId, { pantryProcessedByWeek: updated });
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
    pantryCheckedKeysByWeek: { ...currentMap, [weekKey]: next },
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

  const patch: Partial<HouseholdPantryState> = {};
  let dirty = false;

  function migrate<T>(
    field: Record<string, T> | undefined
  ): Record<string, T> | null {
    if (!field) return null;
    if (!(legacyKey in field)) return null;
    const next = { ...field };
    if (!(weekKey in next)) next[weekKey] = next[legacyKey];
    delete next[legacyKey];
    return next;
  }

  const a = migrate(state.pantryAddedByWeek);
  if (a) { patch.pantryAddedByWeek = a; dirty = true; }
  const c = migrate(state.pantryCheckedByWeek);
  if (c) { patch.pantryCheckedByWeek = c; dirty = true; }
  const p = migrate(state.pantryProcessedByWeek);
  if (p) { patch.pantryProcessedByWeek = p; dirty = true; }
  const ck = migrate(state.pantryCheckedKeysByWeek);
  if (ck) { patch.pantryCheckedKeysByWeek = ck; dirty = true; }

  if (!dirty) return;
  await patchPantryState(householdId, patch);
}
