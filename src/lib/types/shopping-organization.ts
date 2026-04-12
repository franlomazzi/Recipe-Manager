import type { Timestamp } from "firebase/firestore";

/** A physical area within a shopping location (e.g. "Produce", "Dairy") */
export interface ShoppingSection {
  id: string;
  name: string;
}

/** A place the user buys things (e.g. "Supermarket", "Butcher") */
export interface ShoppingLocation {
  id: string;
  name: string;
  sections: ShoppingSection[];
}

/** A user-defined ingredient category (e.g. "Meat", "Vegetable") */
export interface IngredientCategoryDef {
  id: string;
  name: string;
  emoji?: string;
}

/** Persisted in shoppingLocations/{userId} */
export interface ShoppingLocationsDoc {
  userId: string;
  locations: ShoppingLocation[];
  updatedAt?: Timestamp;
}

/** Persisted in ingredientCategories/{userId} */
export interface IngredientCategoriesDoc {
  userId: string;
  categories: IngredientCategoryDef[];
  updatedAt?: Timestamp;
}

/** One-off metadata override for a free-text shopping list item, scoped to a single week */
export interface OneOffMeta {
  locationId?: string | null;
  sectionId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  price?: number | null;
}
