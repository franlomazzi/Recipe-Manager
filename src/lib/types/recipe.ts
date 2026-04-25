import type { Timestamp } from "firebase/firestore";

export type IngredientCategory =
  | "produce"
  | "dairy"
  | "meat"
  | "seafood"
  | "bakery"
  | "pantry"
  | "frozen"
  | "spices"
  | "condiments"
  | "beverages"
  | "other";

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Reference serving captured from the linked library ingredient at the moment
 * it was picked. Macros on the parent Ingredient are always the scaled values
 * for the recipe's quantity; `reference.calories` etc. are the per-serving
 * baseline so we (and the food tracking app) can re-scale if the quantity
 * later changes. Presence of `reference` means the ingredient is linked.
 */
export interface IngredientReference {
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  netCarbs?: number;
}

export interface Ingredient {
  id: string;
  quantity: number | null;
  /**
   * Canonical unit from src/lib/unit-standards.ts (shared with the food
   * tracking app). When `reference` is set, this is locked to
   * `reference.unit` — scaling only makes sense against the library's
   * reference serving. Legacy recipes may contain non-canonical free-text;
   * it's normalized on next save via the recipe form.
   */
  unit: string;
  name: string;
  category: IngredientCategory;
  note: string;
  // Macros scaled to `quantity` (derived from reference × quantity/reference.amount
  // when linked; free-form when unlinked).
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  netCarbs?: number;
  isAiGenerated?: boolean;
  // Library reference serving — only set when linked to a library ingredient.
  reference?: IngredientReference;
}

// Firestore format used by the food tracking app in nutrition_meals collection.
// `amount`/`calories`/... are the recipe's actual (scaled) values. The
// `reference*` fields hold the library's per-serving baseline so the food
// tracker can re-scale on edit or re-sync when library macros change.
export interface FirestoreMealIngredient {
  foodId: string;
  name: string;
  amount: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  netCarbs?: number;
  isAiGenerated?: boolean;
  referenceAmount?: number;
  referenceUnit?: string;
  referenceCalories?: number;
  referenceProtein?: number;
  referenceCarbs?: number;
  referenceFat?: number;
  referenceFiber?: number;
  referenceNetCarbs?: number;
}

export interface IngredientExtension {
  category: IngredientCategory;
  note: string;
}

export interface StepIngredient {
  ingredientId: string;
  quantity: number | null; // how much of this ingredient is used in this step
}

export interface Step {
  id: string;
  order: number;
  instruction: string;
  timerMinutes: number | null;
  timerLabel: string | null;
  ingredients: StepIngredient[];
}

export interface Recipe {
  id: string;
  userId: string;
  title: string;
  description: string;
  prepTime: number;
  cookTime: number;
  totalTime: number;
  servings: number;
  difficulty: Difficulty;
  categories: string[];
  photoURL: string | null;
  photoStoragePath: string | null;
  notes: string;
  isFavorite: boolean;
  ingredients: Ingredient[];
  steps: Step[];
  searchTerms: string[];
  // Versioning
  version: number;
  // Fork lineage
  parentRecipeId: string | null;
  parentRecipeTitle: string | null;
  forkedFromVersion: number | null;
  // Aggregate rating from cook logs
  rating: number | null;
  cookCount: number;
  // Whether this recipe is shared with the household partner. Only the creator
  // (userId) can edit/delete; partner can view, log cooks, and fork.
  householdShared?: boolean;
  // Ingredient extensions (category/note) keyed by ingredient id/foodId
  ingredientExtensions: Record<string, IngredientExtension>;
  // Origin URL when this recipe was imported from a website, video, etc.
  // Absent on hand-authored recipes.
  sourceUrl?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Stored in subcollection: nutrition_meals/{recipeId}/versions/{versionNumber}
export interface RecipeVersion {
  id: string;
  version: number;
  title: string;
  description: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  difficulty: Difficulty;
  categories: string[];
  ingredients: Ingredient[];
  steps: Step[];
  notes: string;
  changeNote: string; // What changed in this version
  createdAt: Timestamp;
}

// Stored in subcollection: nutrition_meals/{recipeId}/cookLogs/{logId}
export interface CookLog {
  id: string;
  recipeId: string;
  userId: string;
  version: number; // Which version was cooked
  rating: number; // 1-5
  servingsCooked: number;
  notes: string; // General notes about how it went
  improvements: string; // Specific improvements for next time
  appliedToVersion: number | null; // If improvements were applied, which version
  cookedAt: Timestamp;
  createdAt: Timestamp;
}

// Shared ingredient library item (from nutrition_ingredients collection)
// Matches the food tracking app's FoodItem interface
export interface LibraryIngredient {
  id: string;
  name: string;
  brand?: string;
  servingSize: number;
  servingUnit: string;
  barcode?: string;
  photo?: string;
  isOfficial?: boolean;
  origin?: "FatSecret" | "NZ" | "Library" | "Meal";
  unitName?: string;
  servingWeight?: number;
  // Macros (may be 0 if not yet set in food tracking app)
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  netCarbs?: number;
  // Shopping organization metadata (Recipe Manager-only)
  shoppingLocationId?: string | null;
  shoppingSectionId?: string | null;
  shoppingCategoryId?: string | null;
  /** Free-text note shown on the shopping list (e.g. "get the big bottle") */
  shoppingNote?: string | null;
  /** Approximate purchase price for this ingredient — currency-agnostic */
  shoppingPrice?: number | null;
  /** Whether this ingredient is part of the user's recurring pantry checklist */
  isPantryItem?: boolean;
  /**
   * AI-derived conversion factors from non-canonical units to `servingUnit`.
   * Keyed by source unit (e.g. "tsp"). factor × source quantity = target quantity.
   * Populated on first encounter and reused; `targetUnit` is stored explicitly
   * for robustness if `servingUnit` ever changes.
   */
  unitConversions?: Record<string, { factor: number; targetUnit: string }>;
}

export const RECIPE_CATEGORIES = [
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "snack",
  "appetizer",
  "soup",
  "salad",
  "side",
  "drink",
  "bread",
  "sauce",
] as const;

export const CUISINE_TAGS = [
  "italian",
  "mexican",
  "asian",
  "indian",
  "mediterranean",
  "american",
  "french",
  "thai",
  "japanese",
  "chinese",
  "korean",
  "middle-eastern",
  "greek",
  "spanish",
] as const;

export const DIET_TAGS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "keto",
  "low-carb",
  "paleo",
  "whole30",
] as const;
