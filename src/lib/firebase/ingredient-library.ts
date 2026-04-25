import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type { LibraryIngredient } from "@/lib/types/recipe";

const COLLECTION = "nutrition_ingredients";

/**
 * Subscribe to all ingredients owned by a single user.
 * Returns an unsubscribe function.
 */
export function subscribeToLibrary(
  userId: string,
  callback: (items: LibraryIngredient[]) => void
): Unsubscribe {
  const db = getDb();
  const q = query(collection(db, COLLECTION), where("userId", "==", userId));
  return onSnapshot(q, (snap) => {
    const items: LibraryIngredient[] = snap.docs
      .map((d) => d.data() as LibraryIngredient)
      .sort((a, b) => a.name.localeCompare(b.name));
    callback(items);
  });
}

/**
 * Subscribe to a household-merged library: own ingredients + partner's ingredients.
 * Two parallel onSnapshot subscriptions are merged client-side, deduped by id.
 *
 * Pass `partnerUid = null` for solo users.
 */
export function subscribeToHouseholdLibrary(
  userId: string,
  partnerUid: string | null,
  callback: (items: LibraryIngredient[]) => void
): Unsubscribe {
  const db = getDb();
  let mine: LibraryIngredient[] = [];
  let theirs: LibraryIngredient[] = [];

  function emit() {
    const byId = new Map<string, LibraryIngredient>();
    for (const it of mine) byId.set(it.id, it);
    for (const it of theirs) {
      if (!byId.has(it.id)) byId.set(it.id, it);
    }
    const merged = Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    callback(merged);
  }

  const unsubMine = onSnapshot(
    query(collection(db, COLLECTION), where("userId", "==", userId)),
    (snap) => {
      mine = snap.docs.map((d) => d.data() as LibraryIngredient);
      emit();
    }
  );

  let unsubTheirs: Unsubscribe = () => {};
  if (partnerUid) {
    unsubTheirs = onSnapshot(
      query(collection(db, COLLECTION), where("userId", "==", partnerUid)),
      (snap) => {
        theirs = snap.docs.map((d) => d.data() as LibraryIngredient);
        emit();
      }
    );
  }

  return () => {
    unsubMine();
    unsubTheirs();
  };
}

/**
 * Load all library ingredients owned by the user once (non-realtime).
 */
export async function getLibraryIngredients(
  userId: string
): Promise<LibraryIngredient[]> {
  const db = getDb();
  const q = query(collection(db, COLLECTION), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => d.data() as LibraryIngredient)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Delete a single ingredient from the user's library.
 */
export async function deleteLibraryIngredient(
  userId: string,
  ingredientId: string
): Promise<void> {
  await deleteDoc(doc(getDb(), COLLECTION, `${userId}_${ingredientId}`));
}

/**
 * Subscribe to the current user's own ingredients plus the partner's pantry items only.
 * Partner's non-pantry ingredients are excluded (each user manages their own library).
 * Client-side pantry filter avoids a composite Firestore index.
 *
 * Pass `partnerUid = null` for solo users.
 */
export function subscribeToUserWithSharedPantry(
  userId: string,
  partnerUid: string | null,
  callback: (items: LibraryIngredient[]) => void
): Unsubscribe {
  const db = getDb();
  let mine: LibraryIngredient[] = [];
  let theirPantry: LibraryIngredient[] = [];

  function emit() {
    const byId = new Map<string, LibraryIngredient>();
    for (const it of mine) byId.set(it.id, it);
    for (const it of theirPantry) {
      if (!byId.has(it.id)) byId.set(it.id, it);
    }
    const merged = Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    callback(merged);
  }

  const unsubMine = onSnapshot(
    query(collection(db, COLLECTION), where("userId", "==", userId)),
    (snap) => {
      mine = snap.docs.map((d) => d.data() as LibraryIngredient);
      emit();
    }
  );

  let unsubTheirs: Unsubscribe = () => {};
  if (partnerUid) {
    unsubTheirs = onSnapshot(
      query(collection(db, COLLECTION), where("userId", "==", partnerUid)),
      (snap) => {
        theirPantry = snap.docs
          .map((d) => d.data() as LibraryIngredient)
          .filter((i) => i.isPantryItem === true);
        emit();
      }
    );
  }

  return () => {
    unsubMine();
    unsubTheirs();
  };
}

/**
 * Save an ingredient to the shared library.
 * Uses the same document ID convention as the food tracking app: `${userId}_${foodId}`.
 * Merges to preserve any existing fields (e.g., macros set by food tracking app).
 */
export async function saveIngredientToLibrary(
  userId: string,
  ingredient: LibraryIngredient
): Promise<void> {
  const docId = `${userId}_${ingredient.id}`;
  const ref = doc(getDb(), COLLECTION, docId);

  // Strip undefined values — Firestore rejects them
  const data: Record<string, unknown> = { userId, lastUsed: serverTimestamp() };
  for (const [key, val] of Object.entries(ingredient)) {
    if (val !== undefined) data[key] = val;
  }

  await setDoc(ref, data, { merge: true });
}
