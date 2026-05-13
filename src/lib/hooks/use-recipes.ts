"use client";

import { useAppData } from "@/lib/contexts/app-data-context";

export function useRecipes() {
  const { recipes, recipesLoading: loading } = useAppData();
  return { recipes, loading };
}
