import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type {
  ShoppingLocationsDoc,
  ShoppingLocation,
  IngredientCategoriesDoc,
  IngredientCategoryDef,
} from "@/lib/types/shopping-organization";

const LOC_COL = "shoppingLocations";
const CAT_COL = "ingredientCategories";
const ING_COL = "nutrition_ingredients";

function locDoc(userId: string) {
  return doc(getDb(), LOC_COL, userId);
}

function catDoc(userId: string) {
  return doc(getDb(), CAT_COL, userId);
}

export function subscribeToShoppingLocations(
  userId: string,
  callback: (doc: ShoppingLocationsDoc | null) => void
): Unsubscribe {
  return onSnapshot(locDoc(userId), (snap) => {
    callback(snap.exists() ? (snap.data() as ShoppingLocationsDoc) : null);
  });
}

/**
 * Subscribe to a household-merged shopping locations list (own + partner).
 * Each user owns their own doc, but partners can read and reference each
 * other's locations. Edits are still creator-only and enforced in the UI
 * via `userId === currentUid` checks.
 */
export function subscribeToHouseholdShoppingLocations(
  userId: string,
  partnerUid: string | null,
  callback: (locations: ShoppingLocation[]) => void
): Unsubscribe {
  let mine: ShoppingLocation[] = [];
  let theirs: ShoppingLocation[] = [];

  function emit() {
    const byId = new Map<string, ShoppingLocation>();
    for (const loc of mine) byId.set(loc.id, loc);
    for (const loc of theirs) {
      if (!byId.has(loc.id)) byId.set(loc.id, loc);
    }
    callback(Array.from(byId.values()));
  }

  const unsubMine = onSnapshot(locDoc(userId), (snap) => {
    mine = snap.exists()
      ? (snap.data() as ShoppingLocationsDoc).locations ?? []
      : [];
    emit();
  });

  let unsubTheirs: Unsubscribe = () => {};
  if (partnerUid) {
    unsubTheirs = onSnapshot(locDoc(partnerUid), (snap) => {
      theirs = snap.exists()
        ? (snap.data() as ShoppingLocationsDoc).locations ?? []
        : [];
      emit();
    });
  }

  return () => {
    unsubMine();
    unsubTheirs();
  };
}

export function subscribeToIngredientCategories(
  userId: string,
  callback: (doc: IngredientCategoriesDoc | null) => void
): Unsubscribe {
  return onSnapshot(catDoc(userId), (snap) => {
    callback(snap.exists() ? (snap.data() as IngredientCategoriesDoc) : null);
  });
}

/**
 * Subscribe to a household-merged ingredient categories list (own + partner).
 */
export function subscribeToHouseholdIngredientCategories(
  userId: string,
  partnerUid: string | null,
  callback: (categories: IngredientCategoryDef[]) => void
): Unsubscribe {
  let mine: IngredientCategoryDef[] = [];
  let theirs: IngredientCategoryDef[] = [];

  function emit() {
    const byId = new Map<string, IngredientCategoryDef>();
    for (const c of mine) byId.set(c.id, c);
    for (const c of theirs) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
    callback(Array.from(byId.values()));
  }

  const unsubMine = onSnapshot(catDoc(userId), (snap) => {
    mine = snap.exists()
      ? (snap.data() as IngredientCategoriesDoc).categories ?? []
      : [];
    emit();
  });

  let unsubTheirs: Unsubscribe = () => {};
  if (partnerUid) {
    unsubTheirs = onSnapshot(catDoc(partnerUid), (snap) => {
      theirs = snap.exists()
        ? (snap.data() as IngredientCategoriesDoc).categories ?? []
        : [];
      emit();
    });
  }

  return () => {
    unsubMine();
    unsubTheirs();
  };
}

export async function saveLocations(
  userId: string,
  locations: ShoppingLocation[]
): Promise<void> {
  await setDoc(
    locDoc(userId),
    { userId, locations, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function saveCategories(
  userId: string,
  categories: IngredientCategoryDef[]
): Promise<void> {
  await setDoc(
    catDoc(userId),
    { userId, categories, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/**
 * Partially update an existing library ingredient. Use this for shopping metadata,
 * notes, price, pantry flag, etc. Pass `null` to clear a field. Undefined fields are skipped.
 */
export async function updateLibraryIngredient(
  userId: string,
  ingredientId: string,
  fields: {
    name?: string;
    shoppingLocationId?: string | null;
    shoppingSectionId?: string | null;
    shoppingCategoryId?: string | null;
    shoppingNote?: string | null;
    shoppingPrice?: number | null;
    isPantryItem?: boolean;
  }
): Promise<void> {
  const ref = doc(getDb(), ING_COL, `${userId}_${ingredientId}`);
  // Only the fields being updated — updateDoc sends a field-mask patch so the
  // server applies the delta without reading the full document first (unlike
  // setDoc with merge, which is a server-side read-then-write).
  const data: Record<string, unknown> = { lastUsed: serverTimestamp() };
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) data[key] = val;
  }
  try {
    await updateDoc(ref, data);
  } catch (err: unknown) {
    // Document doesn't exist yet — e.g. first time assigning shopping metadata
    // to a partner's pantry ingredient under the current user's id.
    if ((err as { code?: string }).code === "not-found") {
      await setDoc(ref, { userId, ...data }, { merge: true });
    } else {
      throw err;
    }
  }
}

/**
 * Create a new free-text library ingredient (for pantry items the user types in
 * that aren't already linked to anything in the food tracking app).
 */
export async function createPantryLibraryIngredient(
  userId: string,
  name: string,
  fields: {
    shoppingLocationId?: string | null;
    shoppingSectionId?: string | null;
    shoppingCategoryId?: string | null;
    shoppingNote?: string | null;
    shoppingPrice?: number | null;
  } = {}
): Promise<string> {
  const id = crypto.randomUUID();
  const ref = doc(getDb(), ING_COL, `${userId}_${id}`);
  const data: Record<string, unknown> = {
    id,
    userId,
    name,
    servingSize: 1,
    servingUnit: "unit",
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    isPantryItem: true,
    lastUsed: serverTimestamp(),
  };
  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) data[key] = val;
  }
  await setDoc(ref, data, { merge: true });
  return id;
}
