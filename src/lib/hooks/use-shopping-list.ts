"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useRecipes } from "./use-recipes";
import { useActivePlan } from "./use-active-plan";
import { useIngredientLibrary } from "./use-ingredient-library";
import { useHouseholdPantryState } from "./use-household-pantry-state";
import { subscribeToShoppingListState } from "@/lib/firebase/shopping-list";
import type { Recipe, IngredientCategory, LibraryIngredient } from "@/lib/types/recipe";
import type {
  ShoppingItem,
  ShoppingListState,
  CustomShoppingItem,
  ExtraRecipeEntry,
} from "@/lib/types/shopping-list";
import type { OneOffMeta } from "@/lib/types/shopping-organization";
import type { PlanInstance } from "@/lib/types/meal-plan";

function itemKey(name: string, unit: string): string {
  return `${name.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

/** Count how many times each recipe appears in a single week (plan occurrences) */
function recipeOccurrencesForWeek(
  instance: PlanInstance,
  weekIndex: number
): Map<string, number> {
  const counts = new Map<string, number>();
  const week = instance.snapshot[weekIndex];
  if (!week) return counts;
  for (const day of week.days) {
    for (const meal of day.meals) {
      counts.set(meal.mealId, (counts.get(meal.mealId) ?? 0) + 1);
    }
  }
  return counts;
}

interface AggregateContext {
  planOccurrences: Map<string, number>;
  extras: ExtraRecipeEntry[];
  /** Library ingredient ids that were committed via the pantry "Add to shopping list" flow */
  pantryAddedIds: string[];
  recipesMap: Map<string, Recipe>;
  libraryMap: Map<string, LibraryIngredient>;
  checkedKeys: Set<string>;
  pantryCheckedKeys: Set<string>;
  oneOffForWeek: Record<string, OneOffMeta>;
}

/**
 * Aggregate ingredients into ShoppingItems, enriching each with library metadata
 * (location, section, category) when linked, or with one-off overrides if free-text.
 */
function aggregateIngredients(ctx: AggregateContext): ShoppingItem[] {
  const {
    planOccurrences,
    extras,
    pantryAddedIds,
    recipesMap,
    libraryMap,
    checkedKeys,
    pantryCheckedKeys,
    oneOffForWeek,
  } = ctx;

  const merged = new Map<
    string,
    {
      name: string;
      quantity: number | null;
      unit: string;
      category: IngredientCategory;
      isLinked: boolean;
      linkedLibraryItem: LibraryIngredient | null;
      fromPantry: boolean;
      sources: Map<string, { name: string; totalCount: number }>;
    }
  >();

  function addIngredients(recipeId: string, multiplier: number) {
    const recipe = recipesMap.get(recipeId);
    if (!recipe || multiplier <= 0) return;
    for (const ing of recipe.ingredients) {
      const key = itemKey(ing.name, ing.unit);
      const scaledQty = ing.quantity !== null ? ing.quantity * multiplier : null;
      const linkedLib = libraryMap.get(ing.id) ?? null;
      const existing = merged.get(key);
      if (existing) {
        if (scaledQty !== null && existing.quantity !== null) {
          existing.quantity += scaledQty;
        } else {
          existing.quantity = null;
        }
        // Prefer the first linked library item we encounter for metadata
        if (!existing.linkedLibraryItem && linkedLib) {
          existing.linkedLibraryItem = linkedLib;
          existing.isLinked = true;
        }
        const src = existing.sources.get(recipeId);
        if (src) {
          src.totalCount += multiplier;
        } else {
          existing.sources.set(recipeId, { name: recipe.title, totalCount: multiplier });
        }
      } else {
        merged.set(key, {
          name: ing.name,
          quantity: scaledQty,
          unit: ing.unit,
          category: ing.category,
          isLinked: !!linkedLib,
          linkedLibraryItem: linkedLib,
          fromPantry: false,
          sources: new Map([[recipeId, { name: recipe.title, totalCount: multiplier }]]),
        });
      }
    }
  }

  function addPantryItem(libraryId: string) {
    const lib = libraryMap.get(libraryId);
    if (!lib) return;
    const key = itemKey(lib.name, lib.servingUnit ?? "");
    const existing = merged.get(key);
    if (existing) {
      // Already coming from a recipe — just flag pantry origin too
      existing.fromPantry = true;
      if (!existing.linkedLibraryItem) {
        existing.linkedLibraryItem = lib;
        existing.isLinked = true;
      }
    } else {
      merged.set(key, {
        name: lib.name,
        quantity: null,
        unit: lib.servingUnit ?? "",
        category: "other",
        isLinked: true,
        linkedLibraryItem: lib,
        fromPantry: true,
        sources: new Map(),
      });
    }
  }

  for (const [recipeId, count] of planOccurrences) {
    addIngredients(recipeId, count);
  }
  for (const entry of extras) {
    addIngredients(entry.recipeId, entry.servingMultiplier);
  }
  for (const id of pantryAddedIds) {
    addPantryItem(id);
  }

  return Array.from(merged.entries()).map(([key, val]) => {
    // Resolve metadata: prefer linked library item, fall back to one-off override
    const lib = val.linkedLibraryItem;
    const oneOff = oneOffForWeek[key];

    const locationId = lib?.shoppingLocationId ?? oneOff?.locationId ?? null;
    const sectionId = lib?.shoppingSectionId ?? oneOff?.sectionId ?? null;
    const categoryId = lib?.shoppingCategoryId ?? oneOff?.categoryId ?? null;
    const note = lib?.shoppingNote ?? oneOff?.note ?? null;
    const price =
      typeof lib?.shoppingPrice === "number"
        ? lib.shoppingPrice
        : typeof oneOff?.price === "number"
        ? oneOff.price
        : null;

    // Pantry-originated items use the shared (household) checked-key set so
    // ticks sync live between partners. Other items use the per-user set.
    const checked = val.fromPantry
      ? pantryCheckedKeys.has(key)
      : checkedKeys.has(key);

    return {
      key,
      name: val.name,
      quantity: val.quantity,
      unit: val.unit,
      category: val.category,
      isLinked: val.isLinked,
      linkedLibraryId: val.linkedLibraryItem?.id ?? null,
      locationId,
      sectionId,
      categoryId,
      note: note && note.trim() ? note : null,
      price,
      fromPantry: val.fromPantry,
      checked,
      sources: Array.from(val.sources.entries()).map(([id, info]) => ({
        recipeId: id,
        recipeName:
          info.totalCount > 1
            ? `${info.name} ×${info.totalCount}`
            : info.name,
      })),
    };
  });
}

export function useShoppingList(weekIndex: number = 0) {
  const { user } = useAuth();
  const { recipes } = useRecipes();
  const { instance } = useActivePlan();
  const { items: libraryItems } = useIngredientLibrary();
  const { state: pantryState } = useHouseholdPantryState();
  const [state, setState] = useState<ShoppingListState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeToShoppingListState(user.uid, (s) => {
      setState(s);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const recipesMap = useMemo(
    () => new Map(recipes.map((r) => [r.id, r])),
    [recipes]
  );

  const libraryMap = useMemo(
    () => new Map(libraryItems.map((li) => [li.id, li])),
    [libraryItems]
  );

  const planOccurrences = useMemo(
    () =>
      instance
        ? recipeOccurrencesForWeek(instance, weekIndex)
        : new Map<string, number>(),
    [instance, weekIndex]
  );

  const extraByWeek = useMemo(() => state?.extraByWeek ?? {}, [state]);

  const oneOffByWeek = useMemo(
    () => state?.oneOffByWeek ?? {},
    [state]
  );

  const oneOffForWeek = useMemo(
    () => oneOffByWeek[String(weekIndex)] ?? {},
    [oneOffByWeek, weekIndex]
  );

  const extraEntries: ExtraRecipeEntry[] = useMemo(
    () => extraByWeek[String(weekIndex)] ?? [],
    [extraByWeek, weekIndex]
  );

  const checkedKeys = useMemo(
    () => new Set(state?.checkedKeys ?? []),
    [state]
  );

  // Pantry data — sourced from the household pantry state doc.
  const pantryAddedByWeek = pantryState.pantryAddedByWeek;
  const pantryCheckedByWeek = pantryState.pantryCheckedByWeek;
  const pantryProcessedByWeek = pantryState.pantryProcessedByWeek;
  const pantryAddedIds = useMemo(
    () => pantryAddedByWeek[String(weekIndex)] ?? [],
    [pantryAddedByWeek, weekIndex]
  );
  const pantryCheckedIds = useMemo(
    () => pantryCheckedByWeek[String(weekIndex)] ?? [],
    [pantryCheckedByWeek, weekIndex]
  );
  const pantryProcessed = !!pantryProcessedByWeek[String(weekIndex)];

  const sharedPantryCheckedKeys = useMemo(
    () =>
      new Set(
        pantryState.pantryCheckedKeysByWeek[String(weekIndex)] ?? []
      ),
    [pantryState, weekIndex]
  );

  const items = useMemo(
    () =>
      aggregateIngredients({
        planOccurrences,
        extras: extraEntries,
        pantryAddedIds,
        recipesMap,
        libraryMap,
        checkedKeys,
        pantryCheckedKeys: sharedPantryCheckedKeys,
        oneOffForWeek,
      }),
    [
      planOccurrences,
      extraEntries,
      pantryAddedIds,
      recipesMap,
      libraryMap,
      checkedKeys,
      sharedPantryCheckedKeys,
      oneOffForWeek,
    ]
  );

  const customItems: CustomShoppingItem[] = useMemo(
    () => state?.customItems ?? [],
    [state]
  );

  const availableRecipes = useMemo(
    () => recipes.filter((r) => r.ingredients.length > 0),
    [recipes]
  );

  const planRecipes = useMemo(
    () =>
      Array.from(planOccurrences.keys())
        .map((id) => recipesMap.get(id))
        .filter(Boolean) as Recipe[],
    [planOccurrences, recipesMap]
  );

  const extraRecipes = useMemo(
    () =>
      extraEntries
        .map((e) => ({ entry: e, recipe: recipesMap.get(e.recipeId) }))
        .filter((x): x is { entry: ExtraRecipeEntry; recipe: Recipe } => !!x.recipe),
    [extraEntries, recipesMap]
  );

  return {
    items,
    customItems,
    checkedKeys: state?.checkedKeys ?? [],
    extraByWeek,
    oneOffByWeek,
    oneOffForWeek,
    extraEntries,
    planOccurrences,
    availableRecipes,
    planRecipes,
    extraRecipes,
    pantryAddedByWeek,
    pantryCheckedByWeek,
    pantryProcessedByWeek,
    pantryAddedIds,
    pantryCheckedIds,
    pantryProcessed,
    sharedPantryCheckedByWeek: pantryState.pantryCheckedKeysByWeek,
    loading,
    hasActivePlan: !!instance,
    instance,
  };
}
