"use client";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import { useRecipes } from "./use-recipes";
import { useIngredientLibrary } from "./use-ingredient-library";
import { useHouseholdPantryState } from "./use-household-pantry-state";
import {
  subscribeToShoppingListState,
  migrateWeekKey,
} from "@/lib/firebase/shopping-list";
import { migratePantryWeekKey } from "@/lib/firebase/household-pantry";
import { getIndicesForDate } from "@/lib/firebase/meal-plans";
import { normalizeUnit } from "@/lib/unit-standards";
import { isoWeekKey, isoWeekKeyForOffset, legacyWeekKey } from "@/lib/utils/week-keys";
import { addDays, parseISO, startOfWeek } from "date-fns";
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
  // Normalize the unit segment so legacy recipes with "grams" group with
  // current recipes using "g". See src/lib/unit-standards.ts.
  return `${name.trim().toLowerCase()}|${normalizeUnit(unit)}`;
}

/**
 * Count recipe occurrences for a calendar week (Mon–Sun).
 * weekOffset=0 is the Monday of the week containing planStart.
 * Days outside the plan range are skipped.
 */
function recipeOccurrencesForCalendarWeek(
  instance: PlanInstance,
  weekOffset: number
): Map<string, number> {
  const counts = new Map<string, number>();
  const planStart = parseISO(instance.startDate);
  const firstMonday = startOfWeek(planStart, { weekStartsOn: 1 });
  for (let i = 0; i < 7; i++) {
    const date = addDays(firstMonday, weekOffset * 7 + i);
    const indices = getIndicesForDate(instance, date);
    if (!indices) continue;
    const day = instance.snapshot[indices.weekIndex]?.days[indices.dayIndex];
    if (!day) continue;
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
          unit: normalizeUnit(ing.unit),
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
        unit: normalizeUnit(lib.servingUnit ?? ""),
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

export function useShoppingList(weekIndex: number = 0, planInstance?: PlanInstance | null) {
  const { user } = useAuth();
  const { recipes } = useRecipes();
  const { items: libraryItems } = useIngredientLibrary();
  const instance = planInstance ?? null;
  const { state: pantryState, householdId } = useHouseholdPantryState();
  const [state, setState] = useState<ShoppingListState | null>(null);
  const [loading, setLoading] = useState(true);

  // ISO-week key for the selected week. Stable across plan edits/replacements.
  // Falls back to today's ISO week when there's no active plan.
  const weekKey = useMemo(() => {
    if (instance) return isoWeekKeyForOffset(instance.startDate, weekIndex);
    return isoWeekKey(new Date());
  }, [instance, weekIndex]);
  const legacyKey = legacyWeekKey(weekIndex);

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
        ? recipeOccurrencesForCalendarWeek(instance, weekIndex)
        : new Map<string, number>(),
    [instance, weekIndex]
  );

  const extraByWeek = useMemo(() => state?.extraByWeek ?? {}, [state]);

  const oneOffByWeek = useMemo(
    () => state?.oneOffByWeek ?? {},
    [state]
  );

  const oneOffForWeek = useMemo(
    () => oneOffByWeek[weekKey] ?? oneOffByWeek[legacyKey] ?? {},
    [oneOffByWeek, weekKey, legacyKey]
  );

  const extraEntries: ExtraRecipeEntry[] = useMemo(
    () => extraByWeek[weekKey] ?? extraByWeek[legacyKey] ?? [],
    [extraByWeek, weekKey, legacyKey]
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
    () => pantryAddedByWeek[weekKey] ?? pantryAddedByWeek[legacyKey] ?? [],
    [pantryAddedByWeek, weekKey, legacyKey]
  );
  const pantryCheckedIds = useMemo(
    () => pantryCheckedByWeek[weekKey] ?? pantryCheckedByWeek[legacyKey] ?? [],
    [pantryCheckedByWeek, weekKey, legacyKey]
  );
  const pantryProcessed =
    !!(pantryProcessedByWeek[weekKey] ?? pantryProcessedByWeek[legacyKey]);

  const sharedPantryCheckedKeys = useMemo(
    () =>
      new Set(
        pantryState.pantryCheckedKeysByWeek[weekKey] ??
          pantryState.pantryCheckedKeysByWeek[legacyKey] ??
          []
      ),
    [pantryState, weekKey, legacyKey]
  );

  // Best-effort one-time migration: if legacy numeric-offset data exists for
  // this week, copy it to the new ISO-week key and delete the legacy entry.
  useEffect(() => {
    if (!user || !state) return;
    if (legacyKey === weekKey) return;
    const hasLegacy =
      legacyKey in (state.extraByWeek ?? {}) ||
      legacyKey in (state.oneOffByWeek ?? {});
    if (hasLegacy) {
      void migrateWeekKey(user.uid, legacyKey, weekKey, state);
    }
  }, [user, state, legacyKey, weekKey]);

  useEffect(() => {
    if (!householdId) return;
    if (legacyKey === weekKey) return;
    const hasLegacy =
      legacyKey in (pantryState.pantryAddedByWeek ?? {}) ||
      legacyKey in (pantryState.pantryCheckedByWeek ?? {}) ||
      legacyKey in (pantryState.pantryProcessedByWeek ?? {}) ||
      legacyKey in (pantryState.pantryCheckedKeysByWeek ?? {});
    if (hasLegacy) {
      void migratePantryWeekKey(householdId, legacyKey, weekKey, pantryState);
    }
  }, [householdId, pantryState, legacyKey, weekKey]);

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
    weekKey,
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
    hasActivePlan: !!planInstance,
    instance: planInstance ?? null,
  };
}
