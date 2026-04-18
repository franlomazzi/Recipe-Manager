import type {
  Recipe,
  Ingredient,
  IngredientExtension,
  FirestoreMealIngredient,
  Step,
} from "@/lib/types/recipe";

/**
 * Converts a Firestore nutrition_meals document to the internal Recipe type.
 * Handles both food-tracking-only meals (no steps) and full recipes.
 */
export function firestoreDocToRecipe(
  id: string,
  data: Record<string, unknown>
): Recipe {
  const rawIngredients = (data.ingredients ?? []) as FirestoreMealIngredient[];
  const extensions = (data.ingredientExtensions ?? {}) as Record<
    string,
    IngredientExtension
  >;

  const ingredients: Ingredient[] = rawIngredients.map((mi) => {
    const ext = extensions[mi.foodId];
    return {
      id: mi.foodId,
      quantity: mi.amount ?? null,
      unit: mi.unit ?? "",
      name: mi.name ?? "",
      category: ext?.category ?? "other",
      note: ext?.note ?? "",
      // Preserve macros for round-trip
      calories: mi.calories ?? 0,
      protein: mi.protein ?? 0,
      carbs: mi.carbs ?? 0,
      fat: mi.fat ?? 0,
      fiber: mi.fiber,
      netCarbs: mi.netCarbs,
      isAiGenerated: mi.isAiGenerated,
    };
  });

  const rawSteps = (data.steps ?? []) as Step[];

  return {
    id,
    userId: (data.userId as string) ?? "",
    title: (data.name as string) ?? (data.title as string) ?? "",
    description: (data.description as string) ?? "",
    prepTime: (data.prepTime as number) ?? 0,
    cookTime: (data.cookTime as number) ?? 0,
    totalTime: (data.totalTime as number) ?? 0,
    servings: (data.servings as number) ?? 1,
    difficulty: (data.difficulty as Recipe["difficulty"]) ?? "easy",
    categories: (data.categories as string[]) ?? [],
    photoURL: (data.photo as string) ?? (data.photoURL as string) ?? null,
    photoStoragePath: (data.photoStoragePath as string) ?? null,
    notes: (data.notes as string) ?? "",
    isFavorite: (data.isFavorite as boolean) ?? false,
    ingredients,
    steps: rawSteps.map((s) => ({
      ...s,
      ingredients: s.ingredients ?? [],
    })),
    searchTerms: (data.searchTerms as string[]) ?? [],
    version: (data.version as number) ?? 1,
    parentRecipeId: (data.parentRecipeId as string) ?? null,
    parentRecipeTitle: (data.parentRecipeTitle as string) ?? null,
    forkedFromVersion: (data.forkedFromVersion as number) ?? null,
    rating: (data.rating as number) ?? null,
    cookCount: (data.cookCount as number) ?? 0,
    householdShared: (data.householdShared as boolean) ?? false,
    ingredientExtensions: extensions,
    sourceUrl: (data.sourceUrl as string) ?? null,
    createdAt: data.createdAt as Recipe["createdAt"],
    updatedAt: data.updatedAt as Recipe["updatedAt"],
  };
}

/**
 * Converts the internal Recipe (or partial recipe data) to the Firestore
 * nutrition_meals document format for writing.
 *
 * Returns a plain object ready for setDoc/updateDoc. The caller adds
 * timestamps and userId.
 */
export function recipeToFirestoreDoc(
  recipe: Omit<Recipe, "id" | "userId" | "createdAt" | "updatedAt">
): Record<string, unknown> {
  // Convert Ingredient[] back to MealIngredient format
  const firestoreIngredients: FirestoreMealIngredient[] =
    recipe.ingredients.map((ing) => ({
      foodId: ing.id,
      name: ing.name,
      amount: ing.quantity ?? 0,
      unit: ing.unit,
      calories: ing.calories ?? 0,
      protein: ing.protein ?? 0,
      carbs: ing.carbs ?? 0,
      fat: ing.fat ?? 0,
      ...(ing.fiber !== undefined && { fiber: ing.fiber }),
      ...(ing.netCarbs !== undefined && { netCarbs: ing.netCarbs }),
      ...(ing.isAiGenerated !== undefined && {
        isAiGenerated: ing.isAiGenerated,
      }),
    }));

  // Build ingredient extensions map
  const ingredientExtensions: Record<string, IngredientExtension> = {};
  for (const ing of recipe.ingredients) {
    if (ing.category !== "other" || ing.note) {
      ingredientExtensions[ing.id] = {
        category: ing.category,
        note: ing.note,
      };
    }
  }

  return {
    // Food tracking canonical fields
    name: recipe.title,
    description: recipe.description,
    photo: recipe.photoURL,
    ingredients: firestoreIngredients,

    // Recipe Manager fields
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.totalTime,
    servings: recipe.servings,
    difficulty: recipe.difficulty,
    categories: recipe.categories,
    photoStoragePath: recipe.photoStoragePath,
    notes: recipe.notes,
    isFavorite: recipe.isFavorite,
    steps: recipe.steps,
    searchTerms: recipe.searchTerms,
    version: recipe.version ?? 1,
    parentRecipeId: recipe.parentRecipeId ?? null,
    parentRecipeTitle: recipe.parentRecipeTitle ?? null,
    forkedFromVersion: recipe.forkedFromVersion ?? null,
    rating: recipe.rating ?? null,
    cookCount: recipe.cookCount ?? 0,
    ingredientExtensions,
    // Only include sourceUrl when present — Firestore rejects undefined.
    ...(recipe.sourceUrl ? { sourceUrl: recipe.sourceUrl } : {}),
  };
}
