import {
  collection,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "./config";
import type { Recipe, RecipeVersion, CookLog } from "@/lib/types/recipe";
import {
  firestoreDocToRecipe,
  recipeToFirestoreDoc,
} from "@/lib/utils/meal-mapper";

const COLLECTION = "nutrition_meals";

// ── Recipes (stored in nutrition_meals) ──

export async function createRecipe(
  userId: string,
  data: Omit<Recipe, "id" | "userId" | "createdAt" | "updatedAt">
) {
  const db = getDb();
  const docRef = doc(collection(db, COLLECTION));
  const firestoreData = recipeToFirestoreDoc(data);
  await setDoc(docRef, {
    ...firestoreData,
    id: docRef.id,
    userId,
    householdShared: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateRecipe(
  recipeId: string,
  data: Partial<Omit<Recipe, "id" | "userId" | "createdAt">>
) {
  const db = getDb();
  const ref = doc(db, COLLECTION, recipeId);

  // For partial updates, we need to handle the field mapping individually.
  // If title is being updated, also update name (food tracking canonical).
  // If ingredients are being updated, map them and rebuild extensions.
  const mapped: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (data.title !== undefined) mapped.name = data.title;
  if (data.description !== undefined) mapped.description = data.description;
  if (data.photoURL !== undefined) mapped.photo = data.photoURL;
  if (data.photoStoragePath !== undefined)
    mapped.photoStoragePath = data.photoStoragePath;
  if (data.prepTime !== undefined) mapped.prepTime = data.prepTime;
  if (data.cookTime !== undefined) mapped.cookTime = data.cookTime;
  if (data.totalTime !== undefined) mapped.totalTime = data.totalTime;
  if (data.servings !== undefined) mapped.servings = data.servings;
  if (data.difficulty !== undefined) mapped.difficulty = data.difficulty;
  if (data.categories !== undefined) mapped.categories = data.categories;
  if (data.notes !== undefined) mapped.notes = data.notes;
  if (data.isFavorite !== undefined) mapped.isFavorite = data.isFavorite;
  if (data.steps !== undefined) mapped.steps = data.steps;
  if (data.searchTerms !== undefined) mapped.searchTerms = data.searchTerms;
  if (data.version !== undefined) mapped.version = data.version;
  if (data.parentRecipeId !== undefined)
    mapped.parentRecipeId = data.parentRecipeId;
  if (data.parentRecipeTitle !== undefined)
    mapped.parentRecipeTitle = data.parentRecipeTitle;
  if (data.forkedFromVersion !== undefined)
    mapped.forkedFromVersion = data.forkedFromVersion;
  if (data.rating !== undefined) mapped.rating = data.rating;
  if (data.cookCount !== undefined) mapped.cookCount = data.cookCount;

  // If ingredients are provided, convert to Firestore format + rebuild extensions
  if (data.ingredients !== undefined) {
    const fullDoc = recipeToFirestoreDoc({
      ...({} as Omit<Recipe, "id" | "userId" | "createdAt" | "updatedAt">),
      ingredients: data.ingredients,
      title: "",
      description: "",
      photoURL: null,
      photoStoragePath: null,
      prepTime: 0,
      cookTime: 0,
      totalTime: 0,
      servings: 1,
      difficulty: "easy",
      categories: [],
      notes: "",
      isFavorite: false,
      steps: [],
      searchTerms: [],
      version: 1,
      parentRecipeId: null,
      parentRecipeTitle: null,
      forkedFromVersion: null,
      rating: null,
      cookCount: 0,
      ingredientExtensions: {},
    });
    mapped.ingredients = fullDoc.ingredients;
    mapped.ingredientExtensions = fullDoc.ingredientExtensions;
  }

  await updateDoc(ref, mapped);
}

export async function setRecipeShared(
  recipeId: string,
  shared: boolean
): Promise<void> {
  await updateDoc(doc(getDb(), COLLECTION, recipeId), {
    householdShared: shared,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRecipe(recipeId: string) {
  await deleteDoc(doc(getDb(), COLLECTION, recipeId));
}

export async function getRecipe(recipeId: string): Promise<Recipe | null> {
  const snap = await getDoc(doc(getDb(), COLLECTION, recipeId));
  if (!snap.exists()) return null;
  return firestoreDocToRecipe(snap.id, snap.data());
}

export async function listRecipes(
  userId: string,
  constraints: QueryConstraint[] = []
): Promise<Recipe[]> {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    ...constraints
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => firestoreDocToRecipe(d.id, d.data()));
}

/**
 * Subscribe to all recipes visible to the user.
 *
 * Visible = own recipes (any sharing state) UNION partner's recipes flagged
 * `householdShared == true`. The two queries run in parallel and are merged
 * client-side, deduped by recipe id.
 *
 * Pass `partnerUid = null` for solo users — only the own-recipes subscription
 * will be opened.
 */
export function subscribeToRecipes(
  userId: string,
  partnerUid: string | null,
  callback: (recipes: Recipe[]) => void,
  constraints: QueryConstraint[] = []
): Unsubscribe {
  const db = getDb();
  let ownRecipes: Recipe[] = [];
  let sharedRecipes: Recipe[] = [];

  function emit() {
    const byId = new Map<string, Recipe>();
    for (const r of ownRecipes) byId.set(r.id, r);
    for (const r of sharedRecipes) {
      if (!byId.has(r.id)) byId.set(r.id, r);
    }
    const merged = Array.from(byId.values()).sort((a, b) => {
      const at = a.updatedAt?.toMillis?.() ?? 0;
      const bt = b.updatedAt?.toMillis?.() ?? 0;
      return bt - at;
    });
    callback(merged);
  }

  const ownQ = query(
    collection(db, COLLECTION),
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
    ...constraints
  );
  const unsubOwn = onSnapshot(ownQ, (snap) => {
    ownRecipes = snap.docs.map((d) => firestoreDocToRecipe(d.id, d.data()));
    emit();
  });

  let unsubShared: Unsubscribe = () => {};
  if (partnerUid) {
    const sharedQ = query(
      collection(db, COLLECTION),
      where("userId", "==", partnerUid),
      where("householdShared", "==", true)
    );
    unsubShared = onSnapshot(sharedQ, (snap) => {
      sharedRecipes = snap.docs.map((d) => firestoreDocToRecipe(d.id, d.data()));
      emit();
    });
  }

  return () => {
    unsubOwn();
    unsubShared();
  };
}

// ── Recipe Versions (subcollection of nutrition_meals) ──

export async function saveRecipeVersion(
  recipeId: string,
  recipe: Recipe,
  changeNote: string
): Promise<void> {
  const db = getDb();
  const versionNum = recipe.version || 1;
  const versionRef = doc(
    db,
    COLLECTION,
    recipeId,
    "versions",
    String(versionNum)
  );
  await setDoc(versionRef, {
    version: versionNum,
    title: recipe.title,
    description: recipe.description,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    categories: recipe.categories,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    notes: recipe.notes,
    changeNote,
    createdAt: serverTimestamp(),
  });
}

export async function getRecipeVersions(
  recipeId: string
): Promise<RecipeVersion[]> {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION, recipeId, "versions"),
    orderBy("version", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RecipeVersion);
}

export async function getRecipeVersion(
  recipeId: string,
  versionNum: number
): Promise<RecipeVersion | null> {
  const snap = await getDoc(
    doc(getDb(), COLLECTION, recipeId, "versions", String(versionNum))
  );
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as RecipeVersion;
}

export function subscribeToVersions(
  recipeId: string,
  callback: (versions: RecipeVersion[]) => void
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION, recipeId, "versions"),
    orderBy("version", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RecipeVersion)
    );
  });
}

// ── Cook Logs (subcollection of nutrition_meals) ──

export async function addCookLog(
  recipeId: string,
  data: Omit<CookLog, "id" | "createdAt">
): Promise<string> {
  const db = getDb();
  const logRef = doc(collection(db, COLLECTION, recipeId, "cookLogs"));
  await setDoc(logRef, {
    ...data,
    createdAt: serverTimestamp(),
  });

  // Update aggregate rating on recipe
  const logs = await getCookLogs(recipeId);
  const avgRating = logs.reduce((sum, l) => sum + l.rating, 0) / logs.length;
  await updateDoc(doc(db, COLLECTION, recipeId), {
    rating: Math.round(avgRating * 10) / 10,
    cookCount: increment(1),
  });

  return logRef.id;
}

export async function getCookLogs(recipeId: string): Promise<CookLog[]> {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION, recipeId, "cookLogs"),
    orderBy("cookedAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CookLog);
}

export function subscribeToCookLogs(
  recipeId: string,
  callback: (logs: CookLog[]) => void
): Unsubscribe {
  const db = getDb();
  const q = query(
    collection(db, COLLECTION, recipeId, "cookLogs"),
    orderBy("cookedAt", "desc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CookLog));
  });
}

// ── Apply Improvement (version bump) ──

export async function applyImprovement(
  recipeId: string,
  currentRecipe: Recipe,
  changes: Partial<
    Pick<
      Recipe,
      "ingredients" | "steps" | "notes" | "prepTime" | "cookTime" | "servings"
    >
  >,
  changeNote: string
): Promise<void> {
  await saveRecipeVersion(recipeId, currentRecipe, changeNote);
  await updateRecipe(recipeId, {
    ...changes,
    version: (currentRecipe.version || 1) + 1,
    totalTime:
      (changes.prepTime ?? currentRecipe.prepTime) +
      (changes.cookTime ?? currentRecipe.cookTime),
  });
}

// ── Restore Version as Current ──

export async function restoreVersion(
  recipeId: string,
  versionToRestore: RecipeVersion
): Promise<void> {
  await updateRecipe(recipeId, {
    title: versionToRestore.title,
    description: versionToRestore.description,
    prepTime: versionToRestore.prepTime,
    cookTime: versionToRestore.cookTime,
    totalTime: versionToRestore.prepTime + versionToRestore.cookTime,
    servings: versionToRestore.servings,
    difficulty: versionToRestore.difficulty,
    categories: versionToRestore.categories,
    ingredients: versionToRestore.ingredients,
    steps: versionToRestore.steps,
    notes: versionToRestore.notes,
    version: versionToRestore.version,
  });
}

// ── Delete Version ──

export async function deleteVersion(
  recipeId: string,
  versionNum: number
): Promise<void> {
  await deleteDoc(
    doc(getDb(), COLLECTION, recipeId, "versions", String(versionNum))
  );
}

// ── Mark Improvements Applied ──

export async function markImprovementsApplied(
  recipeId: string,
  newVersion: number
): Promise<void> {
  const db = getDb();
  const logs = await getCookLogs(recipeId);
  const unapplied = logs.filter(
    (log) => log.improvements?.trim() && log.appliedToVersion === null
  );
  await Promise.all(
    unapplied.map((log) =>
      updateDoc(
        doc(db, COLLECTION, recipeId, "cookLogs", log.id),
        { appliedToVersion: newVersion }
      )
    )
  );
}

// ── Fork Recipe ──

export async function forkRecipe(
  userId: string,
  sourceRecipe: Recipe,
  newTitle: string
): Promise<string> {
  const forkedData: Omit<
    Recipe,
    "id" | "userId" | "createdAt" | "updatedAt"
  > = {
    title: newTitle,
    description: sourceRecipe.description,
    prepTime: sourceRecipe.prepTime,
    cookTime: sourceRecipe.cookTime,
    totalTime: sourceRecipe.totalTime,
    servings: sourceRecipe.servings,
    difficulty: sourceRecipe.difficulty,
    categories: [...sourceRecipe.categories],
    photoURL: sourceRecipe.photoURL,
    photoStoragePath: null,
    notes: sourceRecipe.notes,
    isFavorite: false,
    ingredients: sourceRecipe.ingredients.map((i) => ({
      ...i,
      id: crypto.randomUUID(),
    })),
    steps: sourceRecipe.steps.map((s) => ({ ...s, id: crypto.randomUUID() })),
    searchTerms: sourceRecipe.searchTerms,
    version: 1,
    parentRecipeId: sourceRecipe.id,
    parentRecipeTitle: sourceRecipe.title,
    forkedFromVersion: sourceRecipe.version || 1,
    rating: null,
    cookCount: 0,
    ingredientExtensions: {},
  };

  return createRecipe(userId, forkedData);
}
