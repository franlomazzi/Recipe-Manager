import type { IngredientCategory } from "./recipe";
import type { OneOffMeta } from "./shopping-organization";
import type { Timestamp } from "firebase/firestore";

/** A single aggregated shopping item (same name + unit merged) */
export interface ShoppingItem {
  /** Stable key: lowercase(name)|unit */
  key: string;
  name: string;
  quantity: number | null;
  unit: string;
  /** Legacy built-in category — kept as a fallback display only */
  category: IngredientCategory;
  /** Whether this item is linked to a library ingredient (foodId) */
  isLinked: boolean;
  /** The library ingredient id when linked — needed to update global metadata */
  linkedLibraryId: string | null;
  /** User-assigned shopping location id (or one-off override for the current week) */
  locationId: string | null;
  /** User-assigned section id within the location */
  sectionId: string | null;
  /** User-assigned custom category id */
  categoryId: string | null;
  /** Note shown under the item (from library or one-off) */
  note: string | null;
  /** Approximate purchase price (from library) */
  price: number | null;
  /** Whether this item came from the pantry "Add to shopping list" flow */
  fromPantry: boolean;
  checked: boolean;
  /** Which recipes contributed to this item */
  sources: { recipeId: string; recipeName: string }[];
}

/** A manually-added recipe for a specific week, with an optional servings multiplier */
export interface ExtraRecipeEntry {
  id: string; // UUID — allows multiple entries of same recipe
  recipeId: string;
  servingMultiplier: number; // 1 = default servings, 2 = double, etc.
}

/** Persisted state in Firestore (shoppingLists/{userId}) */
export interface ShoppingListState {
  userId: string;
  /** Keys of items the user has checked off */
  checkedKeys: string[];
  /** Manually-added recipes per week: key = weekIndex as string */
  extraByWeek: Record<string, ExtraRecipeEntry[]>;
  /** Free-text items the user typed in manually */
  customItems: CustomShoppingItem[];
  /**
   * One-off metadata overrides for non-linked items, per-week.
   * Outer key = weekIndex as string, inner key = item key (name|unit) or custom item id.
   */
  oneOffByWeek?: Record<string, Record<string, OneOffMeta>>;
  /** Per-week pantry checkbox state — library ingredient ids the user has checked as "I have enough" */
  pantryCheckedByWeek?: Record<string, string[]>;
  /** Per-week list of pantry library ingredient ids that were committed to the shopping list */
  pantryAddedByWeek?: Record<string, string[]>;
  /** Per-week flag — true once the user has clicked "Add to shopping list" on the pantry section */
  pantryProcessedByWeek?: Record<string, boolean>;
  updatedAt?: Timestamp;
}

export interface CustomShoppingItem {
  id: string;
  name: string;
  checked: boolean;
}
