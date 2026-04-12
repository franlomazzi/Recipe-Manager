"use client";

import { useMemo } from "react";
import { useIngredientLibrary } from "./use-ingredient-library";
import { useHouseholdPantryState } from "./use-household-pantry-state";
import type { LibraryIngredient } from "@/lib/types/recipe";

/**
 * Returns the household's pantry checklist items: library ingredients whose ids
 * appear in `households/{hid}/pantryState/current.pantryItemIds`. The merge with
 * the household library is what makes the pantry visible to both partners.
 */
export function usePantryItems() {
  const { items: libraryItems, loading: libLoading } = useIngredientLibrary();
  const { state, loading: pantryLoading } = useHouseholdPantryState();

  const pantryItems: LibraryIngredient[] = useMemo(() => {
    const ids = new Set(state.pantryItemIds);
    return libraryItems
      .filter((i) => ids.has(i.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [libraryItems, state.pantryItemIds]);

  return { pantryItems, loading: libLoading || pantryLoading };
}
