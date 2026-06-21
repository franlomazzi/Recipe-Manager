import type { IngredientCategory } from "./recipe";
import type { OneOffMeta } from "./shopping-organization";
import type { Timestamp } from "firebase/firestore";
import type { ProvenanceStamp } from "./household";

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
  /**
   * User-defined sort position within the current (location, section) pair.
   * Lower = earlier; null/undefined = unordered (sinks below positioned items).
   */
  sectionPosition: number | null;
  /** User-assigned custom category id */
  categoryId: string | null;
  /** Note shown under the item (from library or one-off) */
  note: string | null;
  /** Approximate purchase price (from library) — raw, for use in the edit dialog */
  price: number | null;
  /** Purchase quantity paired with `price`, in the ingredient's unit */
  priceQty: number | null;
  /**
   * Proportional cost for this week's needed quantity: `(quantity / priceQty) × price`.
   * Falls back to `price` for legacy items without `priceQty`. Null when uncalculable
   * (e.g. pantry items with `priceQty` set but no quantity).
   */
  cost: number | null;
  /** Whether this item came from the pantry "Add to shopping list" flow */
  fromPantry: boolean;
  /** When fromPantry is true: true = household (synced with partner), false = individual (this user only) */
  pantryShared: boolean;
  checked: boolean;
  /**
   * For shared pantry items: present if a household member soft-removed this
   * item from the week's shopping list. UI renders the row as struck through
   * with "Removed by X · Restore". Auto-pruned after 24h.
   */
  removedStamp?: ProvenanceStamp | null;
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
  /**
   * @deprecated Legacy global checked keys (not week-scoped). Migrated on load
   * into `checkedKeysByWeek` under the current ISO week, then cleared. Reads
   * should use `checkedKeysByWeek` instead.
   */
  checkedKeys: string[];
  /**
   * Keys of items the user has checked off, per ISO week. Each week keeps its
   * own "Completed" record so checks don't bleed across weeks.
   */
  checkedKeysByWeek?: Record<string, string[]>;
  /** Manually-added recipes per week: key = weekIndex as string */
  extraByWeek: Record<string, ExtraRecipeEntry[]>;
  /**
   * @deprecated Legacy global custom items (not week-scoped), which leaked across
   * every week. Migrated on load into `customItemsByWeek` under the current ISO
   * week, then cleared. Reads should use `customItemsByWeek` instead.
   */
  customItems?: CustomShoppingItem[];
  /**
   * Free-text items the user typed in manually, per ISO week. Each week keeps its
   * own list so custom items (and their checked state) don't bleed across weeks.
   */
  customItemsByWeek?: Record<string, CustomShoppingItem[]>;
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
  /** Individual (non-shared) pantry item ids — only visible and managed by this user */
  individualPantryItemIds?: string[];
  /** Per-week "I have enough" checks for individual pantry items */
  individualPantryCheckedByWeek?: Record<string, string[]>;
  /** Per-week individual pantry items committed to the shopping list */
  individualPantryAddedByWeek?: Record<string, string[]>;
  /** Per-week flag — true once individual pantry items have been committed */
  individualPantryProcessedByWeek?: Record<string, boolean>;
  /** Per-week item keys the user has explicitly removed from the shopping list */
  exclusionsByWeek?: Record<string, string[]>;
  /** ISO week keys (e.g. "2026-W21") the user has marked as done after shopping */
  closedWeeks?: string[];
  updatedAt?: Timestamp;
}

export interface CustomShoppingItem {
  id: string;
  name: string;
  checked: boolean;
}
