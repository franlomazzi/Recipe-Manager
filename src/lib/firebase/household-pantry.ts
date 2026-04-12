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
  weekIndex: number,
  checkedIds: string[],
  currentMap: Record<string, string[]>
): Promise<void> {
  const updated = { ...currentMap, [String(weekIndex)]: checkedIds };
  await patchPantryState(householdId, { pantryCheckedByWeek: updated });
}

export async function commitPantryForWeek(
  householdId: string,
  weekIndex: number,
  addedIds: string[],
  currentAdded: Record<string, string[]>,
  currentProcessed: Record<string, boolean>
): Promise<void> {
  const wk = String(weekIndex);
  await patchPantryState(householdId, {
    pantryAddedByWeek: { ...currentAdded, [wk]: addedIds },
    pantryProcessedByWeek: { ...currentProcessed, [wk]: true },
  });
}

export async function reopenPantryForWeek(
  householdId: string,
  weekIndex: number,
  currentProcessed: Record<string, boolean>
): Promise<void> {
  const updated = { ...currentProcessed };
  delete updated[String(weekIndex)];
  await patchPantryState(householdId, { pantryProcessedByWeek: updated });
}

/**
 * Toggle the checked state for a pantry-originated shopping list item key
 * within a specific week. Both household members share this state.
 */
export async function toggleSharedPantryCheckedKey(
  householdId: string,
  weekIndex: number,
  key: string,
  currentMap: Record<string, string[]>
): Promise<void> {
  const wk = String(weekIndex);
  const existing = currentMap[wk] ?? [];
  const next = existing.includes(key)
    ? existing.filter((k) => k !== key)
    : [...existing, key];
  await patchPantryState(householdId, {
    pantryCheckedKeysByWeek: { ...currentMap, [wk]: next },
  });
}
