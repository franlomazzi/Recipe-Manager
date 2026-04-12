import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { getDb } from "../config";
import { createHousehold } from "../households";

const USERS = "users";
const HOUSEHOLDS = "households";
const RECIPES = "nutrition_meals";
const TEMPLATES = "nutrition_plan_templates";
const INSTANCES = "nutrition_plan_instances";
const INGREDIENTS = "nutrition_ingredients";
const SHOPPING_LISTS = "shoppingLists";
const PANTRY_STATE = "pantryState";

/**
 * One-shot, idempotent migration from the legacy "profile_1 / profile_2 under one
 * Firebase user" model to the household model. Runs the first time a signed-in user
 * opens the new build.
 *
 * - Creates a household with the user as owner if they don't already have one.
 * - Migrates shoppingLists/{uid}_profile_1 → shoppingLists/{uid}, stripping pantry
 *   fields (those move into the household pantry doc).
 * - Lifts isPantryItem ingredients into households/{hid}/pantryState/current.
 * - Strips profileId from existing nutrition_meals / nutrition_plan_templates /
 *   nutrition_plan_instances docs owned by this user.
 *
 * Idempotent: re-running it once householdId is set is a no-op.
 */
export async function runHouseholdMigration(user: User): Promise<void> {
  const db = getDb();

  // 1. Already migrated?
  const userRef = doc(db, USERS, user.uid);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    const data = userSnap.data() as { householdId?: string };
    if (data.householdId) return;
  }

  // 2. Detect whether this user has any legacy profile-tagged data.
  // If not, this is a brand-new user (or a partner joining via invite code) — skip
  // the rewriting steps; AuthGuard will route them to onboarding.
  const hasLegacyData = await hasAnyLegacyProfileData(user.uid);
  if (!hasLegacyData) return;

  // eslint-disable-next-line no-console
  console.log("[households] migrating legacy profile data for", user.uid);

  // 3. Create the household with this user as owner.
  const householdId = await createHousehold(user, "My Household");

  // 4. Migrate shopping list (profile_1 only — profile_2 was Partner placeholder).
  const legacyListRef = doc(db, SHOPPING_LISTS, `${user.uid}_profile_1`);
  const legacyListSnap = await getDoc(legacyListRef);
  // Salvage pantry fields for the household pantry doc.
  let pantryCheckedByWeek: Record<string, string[]> = {};
  let pantryAddedByWeek: Record<string, string[]> = {};
  let pantryProcessedByWeek: Record<string, boolean> = {};
  if (legacyListSnap.exists()) {
    const data = legacyListSnap.data() as Record<string, unknown>;
    pantryCheckedByWeek =
      (data.pantryCheckedByWeek as Record<string, string[]>) ?? {};
    pantryAddedByWeek =
      (data.pantryAddedByWeek as Record<string, string[]>) ?? {};
    pantryProcessedByWeek =
      (data.pantryProcessedByWeek as Record<string, boolean>) ?? {};

    const newRef = doc(db, SHOPPING_LISTS, user.uid);
    const newSnap = await getDoc(newRef);
    if (!newSnap.exists()) {
      const cleaned: Record<string, unknown> = { ...data };
      delete cleaned.profileId;
      delete cleaned.pantryCheckedByWeek;
      delete cleaned.pantryAddedByWeek;
      delete cleaned.pantryProcessedByWeek;
      cleaned.userId = user.uid;
      cleaned.updatedAt = serverTimestamp();
      await setDoc(newRef, cleaned);
    }
  }

  // 5. Lift pantry items from isPantryItem flags into the household pantry doc.
  const pantryItemIds: string[] = [];
  const ingredientsQ = query(
    collection(db, INGREDIENTS),
    where("userId", "==", user.uid)
  );
  const ingredientsSnap = await getDocs(ingredientsQ);
  for (const d of ingredientsSnap.docs) {
    const data = d.data() as { isPantryItem?: boolean; id?: string };
    if (data.isPantryItem === true) {
      pantryItemIds.push(data.id ?? d.id);
    }
  }
  await setDoc(
    doc(db, HOUSEHOLDS, householdId, PANTRY_STATE, "current"),
    {
      pantryItemIds,
      pantryCheckedByWeek,
      pantryAddedByWeek,
      pantryProcessedByWeek,
      pantryCheckedKeysByWeek: {},
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 6. Strip profileId from recipes / templates / plan instances.
  await stripProfileIdField(user.uid, RECIPES);
  await stripProfileIdField(user.uid, TEMPLATES);
  await stripProfileIdField(user.uid, INSTANCES);

  // eslint-disable-next-line no-console
  console.log("[households] migration complete for", user.uid);
}

async function hasAnyLegacyProfileData(uid: string): Promise<boolean> {
  const db = getDb();
  // Cheapest signal: legacy shopping list doc with the _profile_1 suffix.
  const legacyShopping = await getDoc(doc(db, SHOPPING_LISTS, `${uid}_profile_1`));
  if (legacyShopping.exists()) return true;

  // Otherwise look for any nutrition_meals doc owned by this user that still
  // carries a profileId field.
  const q = query(
    collection(db, RECIPES),
    where("userId", "==", uid),
    where("profileId", "==", "profile_1")
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

async function stripProfileIdField(
  uid: string,
  collectionName: string
): Promise<void> {
  const db = getDb();
  const q = query(
    collection(db, collectionName),
    where("userId", "==", uid)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => d.data().profileId !== undefined);
  if (docs.length === 0) return;
  const CHUNK = 400;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + CHUNK)) {
      batch.update(d.ref, { profileId: deleteField() });
    }
    await batch.commit();
  }
  // eslint-disable-next-line no-console
  console.log(`[households] stripped profileId from ${docs.length} ${collectionName} docs`);
}
