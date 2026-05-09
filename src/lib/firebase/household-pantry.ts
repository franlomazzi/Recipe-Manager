import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  deleteField,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type {
  HouseholdPantryState,
  PantryPurchase,
  PantrySettlement,
  ProvenanceStamp,
  ProvenancedSet,
} from "@/lib/types/household";

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
  pantryPurchasesByWeek: {},
  pantrySettlementsByWeek: {},
  pantryRemovedByWeek: {},
};

export function emptyPantryState(): HouseholdPantryState {
  return {
    pantryItemIds: [],
    pantryCheckedByWeek: {},
    pantryAddedByWeek: {},
    pantryProcessedByWeek: {},
    pantryCheckedKeysByWeek: {},
    pantryPurchasesByWeek: {},
    pantrySettlementsByWeek: {},
    pantryRemovedByWeek: {},
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

// ─── Provenance helpers ──────────────────────────────────────────────────────

/** Build a fresh provenance stamp. Empty `uid` = "actor unknown" (used when migrating legacy data). */
function stamp(uid: string): ProvenanceStamp {
  return { uid, at: Timestamp.now() };
}

/** Extract just the ids from a per-week set, accepting both legacy and current shapes. */
export function idsFromProvenancedSet(raw: ProvenancedSet | undefined): string[] {
  if (!raw) return [];
  return Array.isArray(raw) ? [...raw] : Object.keys(raw);
}

/**
 * Normalize a per-week set into a Map of id → stamp-or-null.
 * `null` means the entry exists but predates provenance (legacy `string[]` shape).
 */
export function provenanceMapFor(
  raw: ProvenancedSet | undefined
): Map<string, ProvenanceStamp | null> {
  const out = new Map<string, ProvenanceStamp | null>();
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (const id of raw) out.set(id, null);
  } else {
    for (const [id, st] of Object.entries(raw)) out.set(id, st);
  }
  return out;
}

/** Read provenance for a `pantryProcessedByWeek` entry (boolean = legacy, stamp = new). */
export function processedStampOf(
  raw: boolean | ProvenanceStamp | undefined
): ProvenanceStamp | null {
  if (!raw || typeof raw === "boolean") return null;
  return raw;
}

/**
 * Apply a single id mutation to a per-week set, preserving prior provenance for
 * other entries. Legacy entries without a stamp are kept with a sentinel
 * `{ uid: "", at: now }` so we never silently lose them.
 */
function upsertProvenancedSet(
  current: ProvenancedSet | undefined,
  id: string,
  present: boolean,
  uid: string
): Record<string, ProvenanceStamp> {
  const map = provenanceMapFor(current);
  if (present) {
    map.set(id, stamp(uid));
  } else {
    map.delete(id);
  }
  const out: Record<string, ProvenanceStamp> = {};
  for (const [k, v] of map) {
    out[k] = v ?? { uid: "", at: Timestamp.now() };
  }
  return out;
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

/**
 * Toggle a single household pantry id's "I have enough this week" flag.
 * Stamps the action with the acting user's uid so the UI can show "skipped by Alice".
 */
export async function setSharedPantryCheck(
  householdId: string,
  weekKey: string,
  libraryId: string,
  checked: boolean,
  uid: string,
  currentForWeek: ProvenancedSet | undefined
): Promise<void> {
  const next = upsertProvenancedSet(currentForWeek, libraryId, checked, uid);
  await patchPantryState(householdId, {
    [`pantryCheckedByWeek.${weekKey}`]: next,
  });
}

/**
 * Commit the household pantry section for the week: replaces the per-week
 * "added to shopping list" set and stamps every entry with the committing user.
 *
 * `extraSkips` are items the user explicitly deselected at commit time. They
 * get added to `pantryCheckedByWeek` so the partner sees the user's "we don't
 * need this" decision and the items don't reappear next time the dialog opens.
 */
export async function commitPantryForWeek(
  householdId: string,
  weekKey: string,
  addedIds: string[],
  uid: string,
  extraSkips?: string[],
  currentSkipsForWeek?: ProvenancedSet,
  currentRemovedForWeek?: ProvenancedSet
): Promise<void> {
  const at = Timestamp.now();
  const addedOut: Record<string, ProvenanceStamp> = {};
  for (const id of addedIds) addedOut[id] = { uid, at };
  const patch: Record<string, unknown> = {
    [`pantryAddedByWeek.${weekKey}`]: addedOut,
    [`pantryProcessedByWeek.${weekKey}`]: { uid, at },
  };
  if (extraSkips && extraSkips.length > 0) {
    const skipMap = provenanceMapFor(currentSkipsForWeek);
    for (const id of extraSkips) skipMap.set(id, { uid, at });
    const skipsOut: Record<string, ProvenanceStamp> = {};
    for (const [k, v] of skipMap) skipsOut[k] = v ?? { uid: "", at };
    patch[`pantryCheckedByWeek.${weekKey}`] = skipsOut;
  }
  // Clear tombstones for any items being re-added — otherwise they'd reappear
  // as struck-through "Removed by X" rows after the commit.
  const removedMap = provenanceMapFor(currentRemovedForWeek);
  let removedDirty = false;
  for (const id of addedIds) {
    if (removedMap.has(id)) {
      removedMap.delete(id);
      removedDirty = true;
    }
  }
  if (removedDirty) {
    const removedOut: Record<string, ProvenanceStamp> = {};
    for (const [k, v] of removedMap) removedOut[k] = v ?? { uid: "", at };
    patch[`pantryRemovedByWeek.${weekKey}`] = removedOut;
  }
  await patchPantryState(householdId, patch);
}

/**
 * Soft-remove a household pantry item from this week's shopping list. The item
 * stays in `pantryAddedByWeek` (so the snapshot is preserved) but a tombstone
 * is recorded in `pantryRemovedByWeek` with the actor's uid. UI renders these
 * as struck-through rows with "Removed by X · Restore". Auto-pruned after 24h.
 */
export async function softRemovePantryItem(
  householdId: string,
  weekKey: string,
  libraryId: string,
  uid: string,
  currentRemovedForWeek: ProvenancedSet | undefined
): Promise<void> {
  const next = upsertProvenancedSet(currentRemovedForWeek, libraryId, true, uid);
  await patchPantryState(householdId, {
    [`pantryRemovedByWeek.${weekKey}`]: next,
  });
}

/** Reverse a soft-remove — the item reappears on the shopping list. */
export async function restorePantryItem(
  householdId: string,
  weekKey: string,
  libraryId: string,
  currentRemovedForWeek: ProvenancedSet | undefined
): Promise<void> {
  const next = upsertProvenancedSet(currentRemovedForWeek, libraryId, false, "");
  await patchPantryState(householdId, {
    [`pantryRemovedByWeek.${weekKey}`]: next,
  });
}

/**
 * Hard-prune tombstones older than `olderThanMs`. Items pruned here also get
 * removed from `pantryAddedByWeek` so they no longer appear at all. Best-effort:
 * called from the page on read; safe to no-op if nothing is stale.
 */
export async function pruneOldPantryRemovals(
  householdId: string,
  weekKey: string,
  currentRemovedForWeek: ProvenancedSet | undefined,
  currentAddedForWeek: ProvenancedSet | undefined,
  olderThanMs: number
): Promise<void> {
  const removedMap = provenanceMapFor(currentRemovedForWeek);
  if (removedMap.size === 0) return;
  const cutoff = Date.now() - olderThanMs;
  const stale: string[] = [];
  for (const [id, st] of removedMap) {
    if (!st || !st.at) continue;
    const ms = typeof st.at.toMillis === "function" ? st.at.toMillis() : 0;
    if (ms && ms < cutoff) stale.push(id);
  }
  if (stale.length === 0) return;

  // Remove from both: tombstone (pantryRemovedByWeek) and the active set (pantryAddedByWeek).
  for (const id of stale) removedMap.delete(id);
  const removedOut: Record<string, ProvenanceStamp> = {};
  for (const [k, v] of removedMap) removedOut[k] = v ?? { uid: "", at: Timestamp.now() };

  const addedMap = provenanceMapFor(currentAddedForWeek);
  for (const id of stale) addedMap.delete(id);
  const addedOut: Record<string, ProvenanceStamp> = {};
  for (const [k, v] of addedMap) addedOut[k] = v ?? { uid: "", at: Timestamp.now() };

  await patchPantryState(householdId, {
    [`pantryRemovedByWeek.${weekKey}`]: removedOut,
    [`pantryAddedByWeek.${weekKey}`]: addedOut,
  });
}

export async function reopenPantryForWeek(
  householdId: string,
  weekKey: string
): Promise<void> {
  await patchPantryState(householdId, {
    [`pantryProcessedByWeek.${weekKey}`]: deleteField(),
  });
}

/**
 * Undo the most recent household pantry commit for a week. Removes the items
 * from the shopping list, clears the processed flag, and tears down any
 * tick/purchase state attached to those items so the cost-balance view stays
 * coherent. Skip flags (pantryCheckedByWeek) are preserved — those reflect
 * "we have this at home", which is information the undo shouldn't discard.
 */
export async function undoLastPantryCommit(
  householdId: string,
  weekKey: string
): Promise<void> {
  await patchPantryState(householdId, {
    [`pantryAddedByWeek.${weekKey}`]: deleteField(),
    [`pantryProcessedByWeek.${weekKey}`]: deleteField(),
    [`pantryCheckedKeysByWeek.${weekKey}`]: deleteField(),
    [`pantryPurchasesByWeek.${weekKey}`]: deleteField(),
    [`pantryRemovedByWeek.${weekKey}`]: deleteField(),
  });
}

/**
 * Toggle the checked state for a pantry-originated shopping list item key
 * within a specific week. Both household members share this state. When the
 * caller provides a `purchase`, the item is being checked ON and we also write
 * a purchase ledger entry; when omitted, the item is being checked OFF and the
 * purchase entry is cleared.
 */
export async function toggleSharedPantryCheckedKey(
  householdId: string,
  weekKey: string,
  key: string,
  uid: string,
  currentForWeek: ProvenancedSet | undefined,
  purchase?: PantryPurchase
): Promise<void> {
  const isCurrentlyChecked = provenanceMapFor(currentForWeek).has(key);
  const next = upsertProvenancedSet(currentForWeek, key, !isCurrentlyChecked, uid);

  const patch: Record<string, unknown> = {
    [`pantryCheckedKeysByWeek.${weekKey}`]: next,
  };
  // Mirror the toggle in the purchase ledger so the cost-balance view stays in sync.
  if (isCurrentlyChecked) {
    patch[`pantryPurchasesByWeek.${weekKey}.${key}`] = deleteField();
  } else if (purchase) {
    patch[`pantryPurchasesByWeek.${weekKey}.${key}`] = purchase;
  }
  await patchPantryState(householdId, patch);
}

/** Manually adjust a recorded purchase cost (e.g. user paid less than estimated). */
export async function updatePantryPurchaseCost(
  householdId: string,
  weekKey: string,
  key: string,
  cost: number
): Promise<void> {
  await patchPantryState(householdId, {
    [`pantryPurchasesByWeek.${weekKey}.${key}.cost`]: cost,
  });
}

/** Record (or overwrite) a per-week settlement: `fromUid` paid `toUid` `amount`. */
export async function setPantryWeekSettlement(
  householdId: string,
  weekKey: string,
  fromUid: string,
  toUid: string,
  amount: number
): Promise<void> {
  const settlement: PantrySettlement = {
    fromUid,
    toUid,
    amount,
    settledAt: Timestamp.now(),
  };
  await patchPantryState(householdId, {
    [`pantrySettlementsByWeek.${weekKey}`]: settlement,
  });
}

/** Undo a prior settlement (returns the week to "pending"). */
export async function clearPantryWeekSettlement(
  householdId: string,
  weekKey: string
): Promise<void> {
  await patchPantryState(householdId, {
    [`pantrySettlementsByWeek.${weekKey}`]: deleteField(),
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
