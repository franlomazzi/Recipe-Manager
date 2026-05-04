"use client";

import { useMemo } from "react";
import { useIngredientLibrary } from "./use-ingredient-library";
import { useHouseholdPantryState } from "./use-household-pantry-state";
import type { LibraryIngredient } from "@/lib/types/recipe";

export type PantryScope = "household" | "individual";

export type PantryItem = LibraryIngredient & { scope: PantryScope };

/**
 * Returns the household's pantry checklist items merged with the user's
 * individual pantry items. Each item carries a `scope` field so callers
 * can route Firestore writes to the correct document.
 *
 * `individualPantryItemIds` should come from the user's ShoppingListState
 * (exposed by useShoppingList) to avoid a duplicate Firestore subscription.
 */
export function usePantryItems(individualPantryItemIds: string[] = []) {
  const { items: libraryItems, loading: libLoading } = useIngredientLibrary();
  const { state, loading: pantryLoading } = useHouseholdPantryState();

  const pantryItems: PantryItem[] = useMemo(() => {
    const householdIds = new Set(state.pantryItemIds);
    const individualIds = new Set(individualPantryItemIds);

    const seen = new Set<string>();
    const result: PantryItem[] = [];

    for (const item of libraryItems) {
      if (seen.has(item.id)) continue;
      if (householdIds.has(item.id)) {
        seen.add(item.id);
        result.push({ ...item, scope: "household" });
      } else if (individualIds.has(item.id)) {
        seen.add(item.id);
        result.push({ ...item, scope: "individual" });
      }
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [libraryItems, state.pantryItemIds, individualPantryItemIds]);

  return { pantryItems, loading: libLoading || pantryLoading };
}
