import type { DraftRecipe } from "@/lib/types/import";
import type { Recipe, Ingredient, Step } from "@/lib/types/recipe";
import type { Timestamp } from "firebase/firestore";

// One-shot handoff of an imported recipe draft from the import modal to the
// new-recipe page. sessionStorage (not localStorage) so it clears when the
// tab closes and never leaks across tabs.
const KEY = "mrm.importDraft";

export function stashImportDraft(draft: DraftRecipe): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage can throw in private browsing — caller will see a
    // missing draft and route the user back to manual entry.
  }
}

/** Reads and clears the stashed draft. Returns null if none or parse fails. */
export function consumeImportDraft(): DraftRecipe | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as DraftRecipe;
  } catch {
    return null;
  }
}

/**
 * Converts an AI DraftRecipe into a Recipe-shaped object that RecipeForm can
 * consume as a pre-fill. `id` is intentionally empty — RecipeForm treats
 * "no id" as "new recipe with pre-filled fields" and routes through
 * createRecipe on save. Fields that RecipeForm only reads under its editing
 * branch (createdAt, updatedAt, userId) are stubbed with safe defaults.
 */
export function draftToRecipeForForm(draft: DraftRecipe): Recipe {
  const ingredients: Ingredient[] = draft.ingredients.map((ing) => ({
    id: crypto.randomUUID(),
    // The AI schema uses 0 for "unmeasured" — round-trip that to null so
    // the form shows an empty quantity field rather than "0".
    quantity: ing.quantity && ing.quantity > 0 ? ing.quantity : null,
    unit: ing.unit ?? "",
    name: ing.name ?? "",
    category: ing.category ?? "other",
    note: ing.note ?? "",
  }));

  const steps: Step[] = draft.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      id: crypto.randomUUID(),
      order: i + 1,
      instruction: s.instruction ?? "",
      // Timer auto-detection runs inside RecipeForm the first time the user
      // touches an instruction, but we can do a cheap pre-pass too. Leaving
      // null here keeps things simple; the form recomputes on edit.
      timerMinutes: null,
      timerLabel: null,
      ingredients: [],
    }));

  return {
    id: "",
    userId: "",
    title: draft.title ?? "",
    description: draft.description ?? "",
    prepTime: draft.prepTime ?? 0,
    cookTime: draft.cookTime ?? 0,
    totalTime: (draft.prepTime ?? 0) + (draft.cookTime ?? 0),
    servings: draft.servings ?? 4,
    difficulty: draft.difficulty ?? "medium",
    categories: draft.categories ?? [],
    photoURL: null,
    photoStoragePath: null,
    notes: draft.notes ?? "",
    isFavorite: false,
    ingredients,
    steps,
    searchTerms: [],
    version: 1,
    parentRecipeId: null,
    parentRecipeTitle: null,
    forkedFromVersion: null,
    rating: null,
    cookCount: 0,
    ingredientExtensions: {},
    sourceUrl: draft.sourceUrl ?? null,
    // These are typed as Timestamp but never read on the new-recipe path.
    // Stubbing with undefined-as-any via a cast keeps the type happy without
    // fabricating fake timestamp values.
    createdAt: undefined as unknown as Timestamp,
    updatedAt: undefined as unknown as Timestamp,
  };
}
