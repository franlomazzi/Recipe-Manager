import type { IngredientCategory, Difficulty } from "@/lib/types/recipe";

// What the user hands us. v1 ships "text" only; the other variants are
// reserved so we can extend the server route without breaking the contract.
export type ImportSource =
  | { type: "text"; text: string }
  | { type: "url"; url: string }
  | { type: "image"; imageBase64: string; mimeType: string }
  | { type: "youtube"; url: string };

// Ingredient shape produced by the AI. Matches the subset of Ingredient that
// can be extracted from unstructured sources. No id yet — assigned client-side
// before pre-filling the form so step-linkage ids stay stable if we ever add
// AI-produced step linkages.
export interface DraftIngredient {
  quantity: number | null;
  unit: string;
  name: string;
  category: IngredientCategory;
  note: string;
}

export interface DraftStep {
  order: number;
  instruction: string;
  // Gemini emits these as required fields (see RECIPE_RESPONSE_SCHEMA) —
  // `0` / `""` mean "no explicit timer in the source". Typed optional here so
  // older drafts or hand-constructed DraftRecipes (tests, manual fixtures)
  // still type-check without having to set placeholder values.
  timerMinutes?: number;
  timerLabel?: string;
}

// The structured recipe the server returns after parsing a source. Mirrors
// Recipe minus server/computed fields: id, userId, timestamps, totalTime,
// searchTerms, version, rating, cookCount, fork lineage, ingredientExtensions,
// isFavorite, photoURL/photoStoragePath. Those are all set by the normal save
// path — the AI never produces them.
export interface DraftRecipe {
  title: string;
  description: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: Difficulty;
  categories: string[];
  notes: string;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  sourceUrl?: string;
}

export interface ImportRecipeResponse {
  draft: DraftRecipe;
}
