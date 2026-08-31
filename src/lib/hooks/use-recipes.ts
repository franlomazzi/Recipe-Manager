"use client";

import { useAppData } from "@/lib/contexts/app-data-context";

export function useRecipes() {
  const {
    recipes,
    recipesLoading: loading,
    hiddenRecipeIds,
    isRecipeHidden,
  } = useAppData();
  return { recipes, loading, hiddenRecipeIds, isRecipeHidden };
}
